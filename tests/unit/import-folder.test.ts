import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What an import writes to the folder.
 *
 * Where a folder is the store, the folder is the truth: on start, and on every
 * change it sees there, the browser's copy is replaced by it. An import that
 * lands only in the browser is therefore on screen for exactly as long as
 * nothing reads the folder — then it is gone, without a word. That happened
 * with eighteen imported Spiele; the two that survived were the two that had
 * been edited since, because an edit files its record.
 *
 * So the test is the same promise as an edit's: every record an import adds is
 * filed, and nothing else is touched.
 */

const filed = {
  collections: [] as string[],
  sentences: [] as string[],
  overrides: [] as string[],
  images: [] as string[],
  listed: 0,
};

vi.mock('../../src/db/folder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/db/folder.ts')>();
  return {
    ...real,
    fileCollection: vi.fn(async (item: { id: string }) => { filed.collections.push(item.id); }),
    fileSentence: vi.fn(async (item: { id: string }) => { filed.sentences.push(item.id); }),
    fileOverride: vi.fn(async (item: { key: string }) => { filed.overrides.push(item.key); }),
    fileImage: vi.fn(async (item: { id: string }) => { filed.images.push(item.id); }),
    pushKind: vi.fn(async () => { filed.listed += 1; }),
  };
});

const { importCollectionFile } = await import('../../src/db/exportImport.ts');
const repo = await import('../../src/db/repo.ts');
const { getDB } = await import('../../src/db/db.ts');

beforeEach(async () => {
  await repo.clearEverything();
  filed.collections = [];
  filed.sentences = [];
  filed.overrides = [];
  filed.images = [];
  filed.listed = 0;
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sentence(id: string, collectionId: string, word: string, image?: string) {
  return {
    id, collectionId, rawInput: word, normalizedInput: word.toLowerCase(),
    slots: [{
      id: `${id}-slot`, sourceToken: word, concept: word.toLowerCase(), origin: 'manual',
      choice: image ? { own: image } : { metacom: `METACOM_Symbole/${word}.png` }, candidates: {},
    }],
    createdAt: 1, updatedAt: 1,
  };
}

const asFile = (data: unknown) => new File([JSON.stringify(data)], 'x.json', { type: 'application/json' });

async function everythingStored() {
  const db = await getDB();
  return {
    collections: (await db.getAll('collections')).map((c) => c.id),
    sentences: (await db.getAll('sentences')).map((s) => s.id),
    images: (await db.getAll('ownImages')).map((i) => i.id),
  };
}

describe('an import and the folder', () => {
  it('files every Sammlung and every card a backup brings', async () => {
    await importCollectionFile(asFile({
      format: 'bildhaft.backup', version: 2, exportedAt: '', notice: '',
      collections: [
        { id: 'a', name: 'Spiel A', kind: 'spiel', createdAt: 1, updatedAt: 1,
          game: { rows: [{ id: 'r', zellen: [{ karte: 's1', platz: false }, { karte: 's2', platz: true }] }] } },
        { id: 'b', name: 'Spiel B', createdAt: 1, updatedAt: 1 },
      ],
      sentences: [sentence('s1', 'a', 'Hund'), sentence('s2', 'a', 'Katze'), sentence('s3', 'b', 'Maus')],
      overrides: [{ key: 'de:metacom:hund', provider: 'metacom', token: 'hund', symbolId: 'x', createdAt: 1, updatedAt: 1 }],
      ownImages: [{ id: 'old', name: 'Foto', type: 'image/png', data: PNG, createdAt: 1 }],
    }));

    const stored = await everythingStored();
    expect(stored.collections).toHaveLength(2);
    expect(new Set(filed.collections)).toEqual(new Set(stored.collections));
    expect(new Set(filed.sentences)).toEqual(new Set(stored.sentences));
    expect(filed.overrides).toEqual(['de:metacom:hund']);
    expect(filed.images).toEqual(stored.images);
    expect(stored.images).toHaveLength(1);
    // One record at a time, never the folder read back and pruned to match.
    expect(filed.listed).toBe(0);
  });

  it('files a single Sammlung, its cards and its own pictures', async () => {
    await importCollectionFile(asFile({
      format: 'bildhaft.collection', version: 3, exportedAt: '', notice: '',
      collection: { id: 'c', name: 'Mit Foto', createdAt: 1, updatedAt: 1 },
      sentences: [sentence('s1', 'c', 'Oma', 'old'), sentence('s2', 'c', 'Opa')],
      ownImages: [{ id: 'old', name: 'Oma', type: 'image/png', data: PNG, createdAt: 1 }],
    }));

    const stored = await everythingStored();
    expect(filed.collections).toEqual(stored.collections);
    expect(new Set(filed.sentences)).toEqual(new Set(stored.sentences));
    expect(filed.images).toEqual(stored.images);
    expect(stored.images).toHaveLength(1);
    expect(filed.listed).toBe(0);
  });

  it('does not file an override the dictionary already had', async () => {
    await repo.putOverride('metacom', 'hund', { id: 'mine', label: 'Hund', score: 1, categories: [] });
    filed.overrides = [];

    await importCollectionFile(asFile({
      format: 'bildhaft.collection', version: 3, exportedAt: '', notice: '',
      collection: { id: 'c', name: 'Tiere', createdAt: 1, updatedAt: 1 },
      sentences: [sentence('s1', 'c', 'Hund')],
      overrides: [
        { key: 'de:metacom:hund', provider: 'metacom', token: 'hund', symbolId: 'theirs', createdAt: 1, updatedAt: 1 },
        { key: 'de:metacom:katze', provider: 'metacom', token: 'katze', symbolId: 'theirs', createdAt: 1, updatedAt: 1 },
      ],
    }));

    expect(filed.overrides).toEqual(['de:metacom:katze']);
  });
});
