import { beforeEach, describe, expect, it } from 'vitest';
import { ArasaacProvider } from '@lautstark/bildquelle';
import * as repo from '../../src/db/repo.ts';
import { buildSlots } from '../../src/core/match.ts';
import { ownImageId } from '../../src/core/types.ts';
import { exportCollection, importCollectionFile } from '../../src/db/exportImport.ts';

/**
 * A photo filed in the Wortschatz is a picture in use, everywhere a picture's
 * fate is decided.
 *
 * There are two ways an own picture reaches a row. The slot picker sets
 * `slot.ownImage`; a word filed with a photo in the Wortschatz is an entry
 * whose `symbolId` is `own:<id>`, and every sentence written with that word
 * gets the id in `slot.choice` instead. The prune and the export only knew the
 * first. So Oma's photo, put in once for every sentence, was deleted the
 * moment any other own picture was taken off any slot — the clear in the
 * picker runs the prune — and a Sammlung exported with her in it arrived
 * without her.
 */
describe('a picture the Wortschatz holds', () => {
  beforeEach(() => repo.clearEverything());

  const aPicture = (name: string) =>
    repo.putOwnImage(new Blob([name], { type: 'image/png' }), `${name}.png`);

  async function omaInTheWortschatz() {
    const image = await aPicture('oma');
    await repo.putOverride('arasaac', 'Oma', { id: ownImageId(image.id), label: 'Oma', score: 1000 });
    return image;
  }

  /** A Sammlung with one sentence written the way the composer writes it. */
  async function aSentenceWithOma() {
    const collection = await repo.createCollection('Familie');
    const slots = await buildSlots('Oma', {
      provider: new ArasaacProvider(),
      stopwords: new Set(),
      overrides: await repo.overrideMap('arasaac'),
    });
    await repo.putSentence({
      id: repo.newId(), normalizedInput: 'oma', rawInput: 'Oma', slots,
      collectionId: collection.id, createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { collection, slots };
  }

  it('survives the prune while only the entry points at it', async () => {
    const image = await omaInTheWortschatz();
    const unused = await aPicture('weg');

    await repo.pruneOwnImages();

    expect(await repo.getOwnImage(image.id)).toBeDefined();
    // And the prune still does its job for a picture nothing points at.
    expect(await repo.getOwnImage(unused.id)).toBeUndefined();
  });

  it('survives the prune while a sentence draws it through its choice', async () => {
    const image = await omaInTheWortschatz();
    const { slots } = await aSentenceWithOma();
    // The fixture is the shape that was missed: no ownImage, the id in choice.
    expect(slots[0]!.ownImage ?? null).toBeNull();
    expect(slots[0]!.choice.arasaac).toBe(ownImageId(image.id));

    // The entry goes; the sentence written with it still shows her.
    await repo.deleteOverride('arasaac', 'Oma');
    await repo.pruneOwnImages();

    expect(await repo.getOwnImage(image.id)).toBeDefined();
  });

  it('travels in the Sammlung’s file, and comes back pointing at itself', async () => {
    await omaInTheWortschatz();
    const { collection } = await aSentenceWithOma();

    const file = await exportCollection((await repo.getCollection(collection.id))!);
    expect(file.ownImages).toHaveLength(1);

    // Into an empty library, as a recipient would have it.
    await repo.clearEverything();
    const done = await importCollectionFile(
      new File([JSON.stringify(file)], 'familie.json', { type: 'application/json' }));

    const [restored] = await repo.listOwnImages();
    const [row] = await repo.listSentences(done.collection.id);
    const [entry] = await repo.listOverrides('arasaac');
    // A fresh id, and both the row and the entry follow it there.
    expect(row!.slots[0]!.choice.arasaac).toBe(ownImageId(restored!.id));
    expect(entry!.symbolId).toBe(ownImageId(restored!.id));
  });
});
