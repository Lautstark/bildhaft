import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What one edit writes to the folder.
 *
 * Where a folder is the store, every change has to reach it — and for a while
 * every change reached it by reading the whole folder back to find out what
 * differed. That is a comparison the caller already knows the answer to, and it
 * is paid per edit: with 280 sentences filed, picking one symbol read and
 * parsed 280 files before the row on screen was allowed to change, on a folder
 * that may well sit in somebody's cloud drive. The delay grew with the library,
 * which is the shape of the complaint it produced — „it got slower".
 *
 * So the test is about the count, not about the contents: an edit to one
 * record files that record.
 */

const filed = {
  sentences: [] as string[],
  collections: [] as string[],
  removed: [] as string[],
  listed: 0,
};

vi.mock('../../src/db/folder.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/db/folder.ts')>();
  return {
    ...real,
    fileSentence: vi.fn(async (item: { id: string }) => { filed.sentences.push(item.id); }),
    fileCollection: vi.fn(async (item: { id: string }) => { filed.collections.push(item.id); }),
    unfile: vi.fn(async (kind: string, id: string) => { filed.removed.push(`${kind}/${id}`); }),
    pushKind: vi.fn(async () => { filed.listed += 1; }),
  };
});

const repo = await import('../../src/db/repo.ts');

beforeEach(() => {
  filed.sentences = [];
  filed.collections = [];
  filed.removed = [];
  filed.listed = 0;
});

async function aCollectionWith(n: number): Promise<{ id: string; sentenceIds: string[] }> {
  const collection = await repo.createCollection();
  const sentenceIds: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = repo.newId();
    sentenceIds.push(id);
    await repo.putSentence({
      id,
      normalizedInput: `wort ${i}`,
      rawInput: `Wort ${i}`,
      slots: [],
      collectionId: collection.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return { id: collection.id, sentenceIds };
}

describe('an edit and the folder', () => {
  it('files the one sentence it changed, and never reads the folder back', async () => {
    const { id, sentenceIds } = await aCollectionWith(3);
    filed.sentences = [];
    filed.collections = [];
    filed.listed = 0;

    const again = sentenceIds[1];
    await repo.putSentence({
      id: again,
      normalizedInput: 'wort 1',
      rawInput: 'Wort 1 — geändert',
      slots: [],
      collectionId: id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(filed.sentences).toEqual([again]);
    // Already listed in the collection, so the collection record did not move.
    expect(filed.collections).toEqual([]);
    expect(filed.listed).toBe(0);
  });

  it('files the collection too when the sentence is a new one in it', async () => {
    const collection = await repo.createCollection();
    filed.collections = [];
    filed.listed = 0;

    const id = repo.newId();
    await repo.putSentence({
      id,
      normalizedInput: 'neu',
      rawInput: 'Neu',
      slots: [],
      collectionId: collection.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(filed.sentences).toEqual([id]);
    expect(filed.collections).toEqual([collection.id]);
    expect(filed.listed).toBe(0);
  });

  it('removes the one file a deleted sentence had, and re-files its collection', async () => {
    const { id, sentenceIds } = await aCollectionWith(3);
    filed.collections = [];
    filed.removed = [];
    filed.listed = 0;

    await repo.deleteSentence(sentenceIds[0]);

    expect(filed.removed).toEqual([`saetze/${sentenceIds[0]}`]);
    expect(filed.collections).toEqual([id]);
    expect(filed.listed).toBe(0);
  });

  it('names every file a deleted Sammlung takes with it', async () => {
    const { id, sentenceIds } = await aCollectionWith(3);
    filed.removed = [];
    filed.listed = 0;

    await repo.deleteCollectionDeep(id);

    expect(new Set(filed.removed)).toEqual(new Set([
      ...sentenceIds.map((sentenceId) => `saetze/${sentenceId}`),
      `sammlungen/${id}`,
    ]));
    expect(filed.listed).toBe(0);
  });
});
