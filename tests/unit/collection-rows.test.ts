import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../../src/db/repo.ts';
import { importCollectionFile } from '../../src/db/exportImport.ts';
import { BACKUP_FORMAT, BACKUP_VERSION, type Sentence } from '../../src/core/types.ts';

/**
 * Which rows a Sammlung has is the store's to say, by its index.
 *
 * It used to be said twice: a `sentenceIds` list on the Sammlung as well,
 * written on every add and removal and read by nothing but the check that
 * decided whether to write it. What that check also did is the one thing
 * kept — a Sammlung that gains or loses a row is stamped, which is what puts
 * it at the top of the sidebar — and old files that carry the list still read.
 */
describe('the rows of a Sammlung', () => {
  beforeEach(() => repo.clearEverything());

  const row = (collectionId: string, id = repo.newId()): Sentence => ({
    id, normalizedInput: 'hallo', rawInput: 'Hallo', slots: [],
    collectionId, createdAt: Date.now(), updatedAt: Date.now(),
  });
  const stamp = async (id: string) => (await repo.getCollection(id))!.updatedAt;
  const later = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('stamps the Sammlung a row arrives in or leaves, and not one a row is edited in', async () => {
    const made = await repo.createCollection('Test');
    const one = row(made.id);

    await later();
    await repo.putSentence(one);
    const added = await stamp(made.id);
    expect(added).toBeGreaterThan(made.updatedAt);

    await later();
    await repo.putSentence({ ...one, rawInput: 'Hallo du' });
    expect(await stamp(made.id)).toBe(added);

    await later();
    await repo.deleteSentence(one.id);
    expect(await stamp(made.id)).toBeGreaterThan(added);
    expect('sentenceIds' in (await repo.getCollection(made.id))!).toBe(false);
  });

  it('reads a backup written while the list still existed, and leaves the list behind', async () => {
    const file = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-09-01T00:00:00.000Z',
      collections: [{ id: 'c1', name: 'Alt', sentenceIds: ['s1'], createdAt: 1, updatedAt: 1 }],
      sentences: [row('c1', 's1')],
    };
    const done = await importCollectionFile(new File([JSON.stringify(file)], 'alt.json'));

    const restored = (await repo.getCollection(done.collection.id))!;
    expect(restored.name).toBe('Alt');
    expect('sentenceIds' in restored).toBe(false);
    expect(await repo.listSentences(restored.id)).toHaveLength(1);
  });
});
