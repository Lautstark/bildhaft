import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormatStep, Library } from '../../src/core/format.ts';

/**
 * The four ways a record comes in, held to one set of steps.
 *
 * core/format.ts is tested on its own for what a step does. What is here is
 * that every door actually goes through it: the folder, this browser's own
 * records, an opened file, a restored Sicherung. Each of them used to have its
 * own answer to an old record, and the folder had none — it is read past
 * db/migrations.ts on every start (adr/0004).
 *
 * This build has no step yet, so the test brings one: format 2, in which a row
 * says „neu" in its title. The folder is a stand-in that hands over whatever
 * `folder` holds and remembers what was filed.
 */
const STEP: FormatStep = {
  to: 2,
  run: (held, due) => ({
    ...held,
    sentences: held.sentences.map((row) => (due(row) ? { ...row, title: 'neu' } : row)),
  }),
};

vi.mock('../../src/core/format.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/format.ts')>();
  return {
    ...real,
    FORMAT: 2,
    holdsNewer: (library: Library) => real.holdsNewer(library, 2),
    upgradeLibrary: (library: Library) => real.upgradeLibrary(library, [STEP], 2),
  };
});

const folder = {
  store: true,
  sawNewer: false,
  kinds: {} as Record<string, object[]>,
  filed: [] as string[],
};

vi.mock('../../src/db/folder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/db/folder.ts')>();
  return {
    ...real,
    isStore: () => folder.store,
    adopted: async () => folder.store,
    sawNewer: () => folder.sawNewer,
    readKind: async (kind: string) => folder.kinds[kind] ?? [],
    readImage: async () => null,
    fileSentence: vi.fn(async (item: { id: string; v?: number }) => { folder.filed.push(`satz ${item.id} v${item.v}`); }),
    fileCollection: vi.fn(async (item: { id: string; v?: number }) => { folder.filed.push(`sammlung ${item.id} v${item.v}`); }),
    fileOverride: vi.fn(async (item: { key: string; v?: number }) => { folder.filed.push(`wort ${item.key} v${item.v}`); }),
    fileImage: vi.fn(async () => undefined),
    pushKind: vi.fn(async () => undefined),
  };
});

const collection = (id: string, v?: number) =>
  ({ id, name: id, createdAt: 1, updatedAt: 1, ...(v ? { v } : {}) });
const sentence = (id: string, collectionId: string, v?: number) =>
  ({ id, collectionId, normalizedInput: id, rawInput: id, slots: [], createdAt: 1, updatedAt: 1, ...(v ? { v } : {}) });

/* A fresh repo each time: whether the data is ahead of the build is remembered
   for the life of the page, which in a test is the life of the module. */
async function fresh() {
  vi.resetModules();
  const repo = await import('../../src/db/repo.ts');
  const files = await import('../../src/db/exportImport.ts');
  const { getDB } = await import('../../src/db/db.ts');
  folder.store = false;
  await repo.clearEverything();
  folder.store = true;
  folder.sawNewer = false;
  folder.kinds = {};
  folder.filed = [];
  return { repo, files, db: await getDB() };
}

const fileOf = (body: object) =>
  new File([JSON.stringify(body)], 'datei.json', { type: 'application/json' });

describe('the folder', () => {
  let at: Awaited<ReturnType<typeof fresh>>;
  beforeEach(async () => { at = await fresh(); });

  it('brings an old record up on the way in, and files it back', async () => {
    folder.kinds = { sammlungen: [collection('c')], saetze: [sentence('alt', 'c'), sentence('schon', 'c', 2)] };

    expect(await at.repo.pullFromFolder()).toBe(true);

    const rows = await at.db.getAll('sentences');
    expect(rows.find((row) => row.id === 'alt')).toMatchObject({ title: 'neu', v: 2 });
    expect(rows.find((row) => row.id === 'schon')?.title).toBeUndefined();
    // Only what a step touched goes back: the row that was already there is not rewritten.
    expect(folder.filed.sort()).toEqual(['sammlung c v2', 'satz alt v2']);
    expect(at.repo.dataIsNewer()).toBe(false);
  });

  it('files nothing when everything is already there', async () => {
    folder.kinds = { sammlungen: [collection('c', 2)], saetze: [sentence('a', 'c', 2)] };
    await at.repo.pullFromFolder();
    expect(folder.filed).toEqual([]);
  });

  it('keeps its hands off a folder that is ahead of this build', async () => {
    await at.db.put('collections', collection('hier', 2) as never);
    folder.kinds = { sammlungen: [collection('c', 3)], saetze: [sentence('a', 'c', 3)] };

    expect(await at.repo.pullFromFolder()).toBe(false);

    expect(at.repo.dataIsNewer()).toBe(true);
    // Neither read over the browser's copy nor written to.
    expect((await at.db.getAll('collections')).map((c) => c.id)).toEqual(['hier']);
    expect(folder.filed).toEqual([]);
  });

  it('takes the folder’s word for it, too', async () => {
    // A file that could not be parsed into a known kind still counted: the
    // package saw a higher `v` than this build writes.
    folder.sawNewer = true;
    folder.kinds = { sammlungen: [collection('c', 2)] };
    expect(await at.repo.pullFromFolder()).toBe(false);
    expect(at.repo.dataIsNewer()).toBe(true);
  });
});

describe('this browser’s own records', () => {
  let at: Awaited<ReturnType<typeof fresh>>;
  beforeEach(async () => { at = await fresh(); folder.store = false; });

  it('are brought up at start where no folder is the store', async () => {
    await at.db.put('collections', collection('c') as never);
    await at.db.put('sentences', sentence('alt', 'c') as never);

    await at.repo.bringRecordsUpToDate();

    expect(await at.db.get('sentences', 'alt')).toMatchObject({ title: 'neu', v: 2 });
    expect((await at.db.get('collections', 'c'))?.v).toBe(2);
    expect(folder.filed).toEqual([]);
  });

  it('are left alone when they are ahead of this build', async () => {
    await at.db.put('sentences', sentence('a', 'c', 3) as never);
    await at.repo.bringRecordsUpToDate();
    expect(at.repo.dataIsNewer()).toBe(true);
    expect((await at.db.get('sentences', 'a'))?.title).toBeUndefined();
  });

  it('say their format from the moment they are written', async () => {
    const made = await at.repo.createCollection('Neu');
    await at.repo.putSentence(sentence('a', made.id) as never);
    expect((await at.db.get('collections', made.id))?.v).toBe(2);
    expect((await at.db.get('sentences', 'a'))?.v).toBe(2);
  });
});

describe('an opened file', () => {
  let at: Awaited<ReturnType<typeof fresh>>;
  beforeEach(async () => { at = await fresh(); folder.store = false; });

  const single = (rows: object[], more: object = {}) => fileOf({
    format: 'bildhaft.collection', version: 3, exportedAt: '', notice: '',
    collection: { name: 'Datei', ...more }, sentences: rows,
  });

  it('brings a Sammlung’s old rows up', async () => {
    const { collection: made } = await at.files.importCollectionFile(single([sentence('alt', 'x')]));
    const [row] = await at.repo.listSentences(made.id);
    expect(row).toMatchObject({ title: 'neu', v: 2 });
    expect((await at.db.get('collections', made.id))?.v).toBe(2);
  });

  it('refuses a Sammlung from a newer build, and adds nothing', async () => {
    await expect(at.files.importCollectionFile(single([sentence('a', 'x', 3)]))).rejects.toThrow(/neuer/);
    expect(await at.db.getAll('collections')).toEqual([]);
  });

  it('brings a Sicherung’s old rows up', async () => {
    await at.files.importCollectionFile(fileOf({
      format: 'bildhaft.backup', version: 2, exportedAt: '', notice: '',
      collections: [collection('c')], sentences: [sentence('alt', 'c')],
    }));
    const [row] = await at.db.getAll('sentences');
    expect(row).toMatchObject({ title: 'neu', v: 2 });
  });

  it('refuses a Sicherung from a newer build', async () => {
    await expect(at.files.importCollectionFile(fileOf({
      format: 'bildhaft.backup', version: 2, exportedAt: '', notice: '',
      collections: [collection('c', 3)], sentences: [],
    }))).rejects.toThrow(/neuer/);
    expect(await at.db.getAll('collections')).toEqual([]);
  });
});
