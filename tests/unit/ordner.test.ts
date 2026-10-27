import { beforeEach, describe, expect, it } from 'vitest';
import type { Collection, Sentence } from '../../src/core/types.ts';
import { copyName, freeName, ordnerOf } from '../../src/core/ordner.ts';
import { copyCollection, exportCollection, importCollectionFile } from '../../src/db/exportImport.ts';
import {
  clearEverything, createCollection, getCollection, listSentences, newId, patchCollection, putSentence,
} from '../../src/db/repo.ts';

const material = (name: string, ordner?: string): Collection =>
  ({ id: newId(), name, kind: 'tafel', createdAt: 0, updatedAt: 0, ...(ordner ? { ordner } : {}) });

describe('the Ordner of a template group', () => {
  it('holds the materials naming it, whatever the case, and leaves the rest loose', () => {
    const rows = [material('Frühstück', 'Mahlzeiten'), material('Knete'), material('Abendessen', 'mahlzeiten')];
    const { ordner, loose } = ordnerOf(rows, 'tafel', []);
    expect(ordner.map((o) => [o.name, o.rows.map((r) => r.name)])).toEqual([['Mahlzeiten', ['Frühstück', 'Abendessen']]]);
    expect(loose.map((r) => r.name)).toEqual(['Knete']);
  });

  it('keeps an empty one the settings know, and only in its own template', () => {
    const { ordner } = ordnerOf([], 'tafel', [{ kind: 'tafel', name: 'Arztbesuch' }, { kind: 'lied', name: 'Laterne' }]);
    expect(ordner).toEqual([{ name: 'Arztbesuch', rows: [] }]);
  });

  it('sorts them by name, so editing one does not move it', () => {
    const rows = [material('a', 'Zoo'), material('b', 'Arzt')];
    expect(ordnerOf(rows, 'tafel', []).ordner.map((o) => o.name)).toEqual(['Arzt', 'Zoo']);
  });

  it('names a new one so it is not taken', () => {
    expect(freeName('Neuer Ordner', ['neuer ordner', 'Neuer Ordner 2'])).toBe('Neuer Ordner 3');
  });

  it('names a copy, and numbers a copy of a copy rather than nesting it', () => {
    expect(copyName('Frühstück', ['Frühstück'], 'Kopie')).toBe('Frühstück (Kopie)');
    expect(copyName('Frühstück (Kopie)', ['Frühstück', 'Frühstück (Kopie)'], 'Kopie')).toBe('Frühstück (Kopie 2)');
  });
});

describe('copying a material', () => {
  beforeEach(() => clearEverything());

  async function breakfast(): Promise<{ tafel: Collection; cards: Sentence[] }> {
    const made = await createCollection('Frühstück', 'tafel');
    const cards: Sentence[] = [];
    for (const word of ['Brot', 'Käse']) {
      const card: Sentence = {
        id: newId(), collectionId: made.id, rawInput: word, normalizedInput: word.toLowerCase(),
        slots: [], createdAt: 0, updatedAt: 0,
      };
      await putSentence(card);
      cards.push(card);
    }
    await patchCollection(made.id, {
      ordner: 'Mahlzeiten',
      title: 'Unser Frühstück',
      print: { orientation: 'landscape' },
      board: {
        cols: 2, rows: 2, cells: [cards[0]!.id, null, cards[1]!.id, null],
        zones: ['essen', 'essen', null, null], styles: { essen: { fill: '#ef9fb6' } },
      },
    });
    return { tafel: (await getCollection(made.id))!, cards };
  }

  it('with everything: its own cards, the grid pointing at them', async () => {
    const { tafel, cards } = await breakfast();
    const copy = await copyCollection(tafel, 'Mittagessen', true);

    const mine = await listSentences(copy.id);
    expect(mine.map((c) => c.rawInput).sort()).toEqual(['Brot', 'Käse']);
    expect(mine.some((c) => cards.some((o) => o.id === c.id)), 'the cards are copies, not shared').toBe(false);
    const brot = mine.find((c) => c.rawInput === 'Brot')!;
    expect(copy.board?.cells[0]).toBe(brot.id);
    expect(copy.ordner).toBe('Mahlzeiten');
    expect(copy.print).toEqual({ orientation: 'landscape' });
    // The original is untouched.
    expect((await listSentences(tafel.id)).length).toBe(2);
  });

  it('with only the look: the grid, groups and print, every field free, no cards', async () => {
    const { tafel } = await breakfast();
    const copy = await copyCollection(tafel, 'Ärztin', false);

    expect(await listSentences(copy.id)).toEqual([]);
    expect(copy.board).toEqual({
      cols: 2, rows: 2, cells: [null, null, null, null],
      zones: ['essen', 'essen', null, null], styles: { essen: { fill: '#ef9fb6' } },
    });
    expect(copy.kind).toBe('tafel');
    expect(copy.ordner).toBe('Mahlzeiten');
    expect(copy.print).toEqual({ orientation: 'landscape' });
  });

  it('leaves the paper title behind, so it follows the new name', async () => {
    const { tafel } = await breakfast();
    expect((await copyCollection(tafel, 'Mittagessen', true)).title).toBeUndefined();
  });

  it('a shared file does not bring its Ordner along', async () => {
    const { tafel } = await breakfast();
    const file = await exportCollection(tafel);
    const imported = await importCollectionFile(new File([JSON.stringify(file)], 'tafel.json'));
    expect((await getCollection(imported.collection.id))?.ordner).toBeUndefined();
  });
});
