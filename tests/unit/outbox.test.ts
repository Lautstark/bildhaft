import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A save is done when the browser has it; the folder is delivered to. adr/0006.
 *
 * The cases here are about the middle of that — the moment a change is in
 * IndexedDB and not yet in the folder — because that moment is new. Before it
 * existed, a write that could not reach the folder left no trace of itself
 * anywhere, and the next read of the folder deleted the record that only this
 * browser had.
 *
 * The folder is faked, with two things a real one has and a plain mock does
 * not: a write can be **held open**, so a test can stand inside one, and a
 * write can be **refused**, so a test can see what is left owed afterwards.
 */

/* Held shut to keep a folder write standing in the middle of itself. */
let writing: Promise<void> = Promise.resolve();
let release = (): void => {};
const hold = (): void => { writing = new Promise<void>((resolve) => { release = resolve; }); };

/** Record ids the folder will not take, for a write that fails on its own. */
const refused = new Set<string>();

/** What the folder holds, by kind and id. */
const inFolder = {
  sammlungen: new Map<string, { name: string }>(),
  saetze: new Map<string, { rawInput: string }>(),
};

const keep = async (
  kind: keyof typeof inFolder, id: string, value: { name: string } & { rawInput: string },
): Promise<boolean> => {
  await writing;
  if (refused.has(id)) return false;
  inFolder[kind].set(id, value);
  return true;
};

vi.mock('../../src/db/folder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/db/folder.ts')>();
  return {
    ...real,
    isStore: () => true,
    isStale: () => false,
    sawNewer: () => false,
    adopted: async () => true,
    readKind: async (kind: 'sammlungen' | 'saetze') => [...inFolder[kind]?.values() ?? []],
    readImage: async () => null,
    fileCollection: (item: { id: string; name: string }) => keep('sammlungen', item.id, item as never),
    fileSentence: (item: { id: string; rawInput: string }) => keep('saetze', item.id, item as never),
    fileOverride: async () => true,
    fileImage: async () => true,
    unfile: async (kind: 'sammlungen' | 'saetze', id: string) => {
      await writing;
      if (refused.has(id)) return false;
      inFolder[kind]?.delete(id);
      return true;
    },
    unfileOverride: async () => true,
    pushKind: async () => {},
  };
});

const repo = await import('../../src/db/repo.ts');
const { getDB } = await import('../../src/db/db.ts');

const satz = (id: string, word: string) => ({
  id, collectionId: 'c1', rawInput: word, normalizedInput: word.toLowerCase(),
  slots: [], createdAt: 1, updatedAt: 1,
});

const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const owing = async () => (await (await getDB()).getAll('waiting')).map((row) => row.id);

beforeEach(async () => {
  writing = Promise.resolve();
  release = () => {};
  refused.clear();
  inFolder.sammlungen.clear();
  inFolder.saetze.clear();
  const db = await getDB();
  for (const store of ['collections', 'sentences', 'overrides', 'ownImages', 'waiting'] as const) {
    await db.clear(store);
  }
});

afterEach(async () => {
  release();
  await repo.delivered().catch(() => undefined);
});

describe('a save and the folder', () => {
  it('returns before the folder has it, and owes it until it does', async () => {
    hold();
    await repo.putSentence(satz('s1', 'Apfel') as never);

    /* Already saved: the record is in the browser, the folder is not there yet,
       and the row says so. This is the whole of adr/0006 in three lines. */
    expect(await (await getDB()).get('sentences', 's1')).toBeTruthy();
    expect(inFolder.saetze.size).toBe(0);
    expect(await repo.owed()).toBe(1);

    release();
    await repo.delivered();
    expect(inFolder.saetze.get('s1')?.rawInput).toBe('Apfel');
    expect(await repo.owed()).toBe(0);
  });

  it('delivers the last of three quick edits, and a deletion as a deletion', async () => {
    await repo.putSentence(satz('s1', 'Apfel') as never);
    await repo.putSentence(satz('s1', 'Apfel rot') as never);
    await repo.putSentence(satz('s1', 'Apfel grün') as never);
    await repo.delivered();
    /* One row was owed throughout — `kind/record` — so the folder is written
       as often as it is delivered to, with the record as it stands. */
    expect(inFolder.saetze.get('s1')?.rawInput).toBe('Apfel grün');

    await repo.putSentence(satz('s1', 'Apfel gelb') as never);
    await repo.deleteSentence('s1');
    await repo.delivered();
    expect(inFolder.saetze.has('s1')).toBe(false);
    expect(await repo.owed()).toBe(0);
  });

  it('is not paid off by a delivery that was under way when it was made', async () => {
    await repo.putSentence(satz('s1', 'Apfel') as never);
    await repo.delivered();

    /* The first delivery stands in its write. The edit made now is one the
       folder will refuse, so only its row says it is owed. */
    hold();
    await repo.putSentence(satz('s1', 'Apfel rot') as never);
    await tick();
    refused.add('s1');
    await repo.putSentence(satz('s1', 'Apfel grün') as never);
    release();
    await repo.delivered();

    /* The refused write left the row standing, and the row it left is the
       newer one — so the folder is still owed the change it has not had. */
    expect(await owing()).toEqual(['saetze/s1']);

    refused.clear();
    await repo.pullFromFolder();
    expect(inFolder.saetze.get('s1')?.rawInput).toBe('Apfel grün');
    expect(await repo.owed()).toBe(0);
  });

  it('keeps owing a change the folder would not take', async () => {
    refused.add('s1');
    await repo.putSentence(satz('s1', 'Apfel') as never);
    await repo.delivered();
    expect(await owing()).toEqual(['saetze/s1']);
    expect(inFolder.saetze.size).toBe(0);
  });

  it('owes nothing where no folder is the store', async () => {
    const folder = await import('../../src/db/folder.ts');
    const was = vi.spyOn(folder, 'isStore').mockReturnValue(false);
    await repo.putSentence(satz('s1', 'Apfel') as never);
    await repo.delivered();
    was.mockRestore();
    expect(await repo.owed()).toBe(0);
  });
});

describe('a folder read and what is owed', () => {
  it('pays what is owed before it reads, so the read cannot undo it', async () => {
    /* The record exists here and the folder has never heard of it — a write
       that failed earlier, or one made while the folder was away. A read that
       replaced the library wholesale deleted exactly this. */
    refused.add('s1');
    await repo.putSentence(satz('s1', 'Nur hier') as never);
    await repo.delivered();
    expect(await repo.owed()).toBe(1);

    refused.clear();
    expect(await repo.pullFromFolder()).toBe(true);

    expect(inFolder.saetze.get('s1')?.rawInput).toBe('Nur hier');
    expect(await (await getDB()).get('sentences', 's1')).toBeTruthy();
  });

  it('does not read at all while something is still owed', async () => {
    refused.add('s1');
    await repo.putSentence(satz('s1', 'Nur hier') as never);
    await repo.delivered();

    /* The folder holds a Satz this browser does not. A read would bring it in
       — and would take the one above out, which is why it is refused while
       anything is owed. */
    inFolder.saetze.set('s-dort', { rawInput: 'Vom anderen Gerät' });
    expect(await repo.pullFromFolder()).toBe(false);
    expect(await (await getDB()).get('sentences', 's-dort')).toBeUndefined();
    expect(await repo.owed()).toBe(1);
  });
});
