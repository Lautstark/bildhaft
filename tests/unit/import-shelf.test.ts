import { beforeEach, describe, expect, it } from 'vitest';
import { importCollectionFile } from '../../src/db/exportImport.ts';
import { clearEverything, getCollection, listSentences } from '../../src/db/repo.ts';

/**
 * A file from the shelf (lautstark.tech/sammlungen) arrives with what the
 * paper says and what the pen says, and both have to survive the fresh ids an
 * import hands out.
 *
 * Two things did not, until 2026-10-29: a Spiel's title on the paper — „Was
 * ist das Gegenteil?" under the name „Was ist das Gegenteil? (III)" — was left
 * behind, so the sheet printed the level; and a Rezept's pen sentences, keyed
 * by the row they belong to, still named the row's old id, so every step's
 * circle said nothing.
 */
describe('a file from the shelf', () => {
  beforeEach(() => clearEverything());

  const slot = (id: string, word: string) => ({
    id, sourceToken: word, concept: word.toLowerCase(), origin: 'lemma' as const,
    choice: { arasaac: '2627' }, candidates: {},
  });
  const file = (collection: object, sentences: object[]) => new File([JSON.stringify({
    format: 'bildhaft.collection', version: 3, exportedAt: '2026-10-29T00:00:00Z',
    collection, sentences, notice: '',
  })], 'regal.json', { type: 'application/json' });

  it('keeps a Spiel’s title on the paper', async () => {
    const { collection } = await importCollectionFile(file({
      name: 'Was ist das Gegenteil? (III)', title: 'Was ist das Gegenteil?', kind: 'spiel',
      game: { rows: [{ id: 'r0', zellen: [{ karte: 's0', platz: false }, { karte: 's1', platz: true }] }] },
    }, [
      { id: 's0', rawInput: 'groß', normalizedInput: 'groß', slots: [slot('s0-0', 'groß')], createdAt: 1 },
      { id: 's1', rawInput: 'klein', normalizedInput: 'klein', slots: [slot('s1-0', 'klein')], createdAt: 2 },
    ]));

    const stored = await getCollection(collection.id);
    expect(stored?.name).toBe('Was ist das Gegenteil? (III)');
    expect(stored?.title).toBe('Was ist das Gegenteil?');
  });

  it('keeps a Rezept’s pen sentences on their steps', async () => {
    const { collection } = await importCollectionFile(file({
      name: 'Waffeln', kind: 'rezept',
      print: { anybookSay: { titel: 'Rezept für Waffeln', s0: 'Drei Eier aufschlagen', 's1-0': 'Mehl' } },
    }, [
      { id: 's0', rawInput: 'Eier', normalizedInput: 'eier', part: 'schritt', slots: [slot('s0-0', 'Eier')], createdAt: 1 },
      { id: 's1', rawInput: 'Mehl', normalizedInput: 'mehl', part: 'zutat', slots: [slot('s1-0', 'Mehl')], createdAt: 2 },
    ]));

    const say = (await getCollection(collection.id))?.print?.anybookSay ?? {};
    const step = (await listSentences(collection.id)).find((row) => row.part === 'schritt')!;
    expect(say[step.id]).toBe('Drei Eier aufschlagen');
    expect(say.s0).toBeUndefined();
    // A card's sentence is keyed by its slot, whose id the import keeps.
    expect(say['s1-0']).toBe('Mehl');
    expect(say.titel).toBe('Rezept für Waffeln');
  });
});
