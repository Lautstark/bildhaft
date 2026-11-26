import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The window between the library being drawn and its being known to be the
 * folder's. adr/0005.
 *
 * `boot` draws what this browser holds and reads the folder afterwards, so for
 * the length of that read the page shows a copy nobody has checked — and
 * somebody can press something. `pull` empties four stores and fills them
 * again, so a write that landed between its two halves was a write the second
 * half deleted. These are the assertions about the *middle* of that read
 * rather than about its ends: that a write waits for it, that it survives it,
 * and that the page is told when it starts and when it stops.
 *
 * The last case is the one that matters a year from now: it asks the question
 * of every mutator by name, so a new one that forgets to wait is a red test
 * rather than a silent hole.
 */

/* Held shut to keep a folder read running for as long as a test needs it to. */
let reading: Promise<void> = Promise.resolve();
let release = (): void => {};
const hold = (): void => { reading = new Promise<void>((resolve) => { release = resolve; }); };
/* The read a test started, so that one left held — by an assertion that failed
   before releasing it — cannot leave a sync standing in the module for every
   test after it. That is a whole file of timeouts from one failure. */
let pending: Promise<unknown> | null = null;
const pull = (): Promise<unknown> => (pending = repo.pullFromFolder());

/** What the fake folder holds. The read replaces the browser's copy with it. */
const inFolder = {
  sammlungen: [] as unknown[],
  saetze: [] as unknown[],
  woerterbuch: [] as unknown[],
  bilder: [] as unknown[],
};

vi.mock('../../src/db/folder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/db/folder.ts')>();
  return {
    ...real,
    isStore: () => true,
    isStale: () => false,
    sawNewer: () => false,
    canWrite: () => true,
    adopted: async () => true,
    /* Plain functions rather than `vi.fn`: the shared vitest config restores
       mocks before every test, which empties a `vi.fn`'s implementation — and
       a `readKind` that answers `undefined` is a folder read that never ends. */
    readKind: async (kind: keyof typeof inFolder) => {
      await reading;
      return inFolder[kind];
    },
    readImage: async () => null,
    /* True, because since adr/0006 that is what these answer: the folder has
       it. A mock that answered `undefined` left every change owed, and a read
       refuses to run while anything is owed — so the sync under test ended
       before it had begun. */
    fileCollection: async () => true,
    fileSentence: async () => true,
    fileOverride: async () => true,
    fileImage: async () => true,
    unfile: async () => true,
    unfileOverride: async () => true,
    pushKind: async () => {},
  };
});

const repo = await import('../../src/db/repo.ts');
const { getDB } = await import('../../src/db/db.ts');

const sammlung = (id: string, name: string) => ({
  id, name, language: 'de', createdAt: 1, updatedAt: 1, v: 1,
});

const satz = (id: string, collectionId: string, word: string) => ({
  id, collectionId, rawInput: word, normalizedInput: word.toLowerCase(), slots: [],
  createdAt: 1, updatedAt: 1, v: 1,
});

/** A turn of the event loop, which is all a parked write needs to prove it is parked. */
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

afterEach(async () => {
  release();
  await pending?.catch(() => undefined);
  pending = null;
});

beforeEach(async () => {
  reading = Promise.resolve();
  release = () => {};
  inFolder.sammlungen = [sammlung('c-folder', 'Aus dem Ordner')];
  inFolder.saetze = [];
  inFolder.woerterbuch = [];
  inFolder.bilder = [];
  const db = await getDB();
  for (const store of ['collections', 'sentences', 'overrides', 'ownImages'] as const) {
    await db.clear(store);
  }
});

const stored = async (store: 'collections' | 'sentences') =>
  (await (await getDB()).getAll(store)).map((row) => row.id);

describe('a write while the folder is being read', () => {
  it('waits for the read and is not wiped by it', async () => {
    const db = await getDB();
    await db.put('collections', sammlung('c-here', 'Vom Rechner') as never);

    hold();
    const read = pull();
    /* Pressed while the read is running, which is what the page now allows to
       be reachable at all: before adr/0005 nothing could be typed this early. */
    const written = repo.putSentence(satz('s1', 'c-here', 'Apfel') as never);

    await tick();
    /* Still nothing: the write is parked. If it had gone ahead here, the clear
       below would have taken it with it. */
    expect(await stored('sentences')).toEqual([]);

    release();
    await read;
    await written;

    /* The folder's Sammlung replaced the browser's, and the row written in the
       middle of that is still there — on top of the folder's answer, which is
       where a change made after the read belongs. */
    expect(await stored('collections')).toEqual(['c-folder']);
    expect(await stored('sentences')).toEqual(['s1']);
  });

  it('says when the read starts and when it ends', async () => {
    const heard: boolean[] = [];
    const stop = repo.onSyncing((busy) => heard.push(busy));
    await pull();
    stop();
    expect(heard).toEqual([true, false]);
  });

  it('is not said at all where no folder is the store', async () => {
    const folder = await import('../../src/db/folder.ts');
    const was = vi.spyOn(folder, 'isStore').mockReturnValue(false);
    const heard: boolean[] = [];
    const stop = repo.onSyncing((busy) => heard.push(busy));
    expect(await pull()).toBe(false);
    stop();
    was.mockRestore();
    expect(heard).toEqual([]);
  });
});

/*
 * Every mutator that writes into one of the four stores the read replaces.
 *
 * `saveSettings` is deliberately not here: the settings store is not one of
 * the four, and a read that replaced the library has nothing to say about the
 * paper size. Everything else that writes a record belongs in this list, and
 * the completeness of it is held by `repo-notifies.test.ts`, which accounts
 * for every export of the module one way or the other.
 */
interface Waiter {
  /** Run before the read is held: a record this case needs to act on. */
  prepare?: () => Promise<void>;
  /** The one call being timed. */
  call: () => Promise<unknown>;
}

const WAITERS: Record<string, Waiter> = {
  createCollection: { call: () => repo.createCollection('Neu') },
  patchCollection: {
    prepare: async () => { await repo.createCollection('Zu ändern'); },
    call: async () => {
      const [held] = await repo.listCollections();
      return repo.patchCollection(held!.id, { name: 'Geändert' });
    },
  },
  deleteCollectionDeep: {
    prepare: async () => { await repo.createCollection('Weg'); },
    call: async () => {
      const [held] = await repo.listCollections();
      return repo.deleteCollectionDeep(held!.id);
    },
  },
  putSentence: { call: () => repo.putSentence(satz('s-wait', 'c-here', 'Birne') as never) },
  deleteSentence: {
    prepare: async () => { await repo.putSentence(satz('s-gone', 'c-here', 'Birne') as never); },
    call: () => repo.deleteSentence('s-gone'),
  },
  clearEverything: { call: () => repo.clearEverything() },
  putOverride: {
    call: () => repo.putOverride('arasaac', 'Hund', { id: '1', label: 'Hund', score: 100 }),
  },
  deleteOverride: {
    prepare: async () => {
      await repo.putOverride('arasaac', 'Katze', { id: '2', label: 'Katze', score: 100 });
    },
    call: () => repo.deleteOverride('arasaac', 'Katze'),
  },
  putOwnImage: {
    call: () => repo.putOwnImage(
      new File([new Uint8Array([1, 2, 3])], 'bild.png', { type: 'image/png' }), 'bild.png'),
  },
  pruneOwnImages: { call: () => repo.pruneOwnImages() },
};

describe('every write waits for a folder read', () => {
  for (const [name, waiter] of Object.entries(WAITERS)) {
    it(`${name}() does not land inside one`, async () => {
      /* Whatever this case needs to act on is written before the read is held,
         so that what is timed below is the one call rather than its setting-up
         — which would park at the same gate and never return. */
      await waiter.prepare?.();

      hold();
      const read = pull();
      let landed = false;
      const write = waiter.call().then(() => { landed = true; });

      await tick();
      expect(landed, `${name}() wrote while the folder was being read`).toBe(false);

      release();
      await read;
      await write;
      expect(landed).toBe(true);
    });
  }
});
