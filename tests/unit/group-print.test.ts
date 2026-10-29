import { beforeEach, describe, expect, it } from 'vitest';
import type { Collection, GameZelle, Sentence, Slot } from '../../src/core/types.ts';
import { groupPrintParts, groupPrintSource } from '../../src/app/print.ts';
import { s } from '../../src/app/state.svelte.ts';
import { defaultSettings } from '../../src/db/repo.ts';
import { copyrightFor, sheetBlocks } from '../../src/ui/printSheet.ts';
import type { PrintOptions } from '../../src/ui/printDialog.svelte.ts';

/**
 * „Alle drucken": a material on the group's shared Kartenbogen must be cut
 * exactly as its single print cuts it. Held here rather than in the browser
 * because the case that broke takes a whole shelf of games — the rows of all
 * of them together are a game no sheet can hold, and the shared Bogen took
 * its measure from that and shrank every card.
 */
const slot = (word: string): Slot => ({
  id: `slot-${word}`, sourceToken: word, concept: word, origin: 'override', chosen: { arasaac: null },
} as unknown as Slot);
const card = (collectionId: string, word: string): Sentence => ({
  id: `${collectionId}-${word}`, normalizedInput: '', rawInput: '', slots: [slot(word)],
  collectionId, createdAt: 0, updatedAt: 0,
} as Sentence);

/** A Spiel of three rows, three printed pictures and a Platzhalter each. */
function game(id: string): { collection: Collection; sentences: Sentence[] } {
  const sentences: Sentence[] = [];
  const rows = [0, 1, 2].map((r) => {
    const zellen: GameZelle[] = ['a', 'b', 'c', 'x'].map((w) => {
      const one = card(id, `${w}${r}`);
      sentences.push(one);
      return { karte: one.id, platz: w === 'x' };
    });
    return { id: `${id}-row${r}`, zellen };
  });
  return {
    collection: { id, name: id, kind: 'spiel', game: { rows }, createdAt: 0, updatedAt: 0 } as unknown as Collection,
    sentences,
  };
}

const cutW = (options: PrintOptions): number => {
  const blocks = sheetBlocks({ ...options, copyright: copyrightFor(options.provider, options.settings.showCopyright) }, null);
  const cut = blocks.find((block) => block.kind === 'game-cut');
  return cut && cut.kind === 'game-cut' ? cut.geo.cutW : 0;
};

describe('the group print', () => {
  beforeEach(() => { s.settings = defaultSettings(); });

  it('cuts every card on the shared Bogen as its single print cuts it', () => {
    const shelf = ['A', 'B', 'C', 'D', 'E', 'F'].map(game);
    const parts = groupPrintParts(shelf, new Set(shelf.map(({ collection }) => collection.id)));
    const shared = parts.filter((part) => part.collection === null);
    expect(shared).toHaveLength(1);
    /* The single print: the whole of one material, its Bogen included. */
    const alone = groupPrintParts([shelf[0]!], new Set(['A']))
      .find((part) => part.collection === null)!;
    const single = cutW({ ...alone.options, cutGeo: undefined, cut: 'with', game: alone.options.game });
    expect(single).toBeGreaterThan(20);
    expect(cutW(shared[0]!.options)).toBeCloseTo(single, 2);
  });

  it('sets what its menu sets over every ticked material, for this print only', () => {
    const shelf = ['A', 'B', 'C'].map(game);
    shelf[1]!.collection.print = { cutMarginMm: 6 };
    const all = new Set(shelf.map(({ collection }) => collection.id));
    let over = {};
    const changed: string[] = [];
    const source = groupPrintSource(shelf, all, over, (next, key) => { over = next; changed.push(key); })!;
    /* Where they disagree, the menu says who has what. */
    expect(source.mixed('cutMarginMm')?.map((group) => group.names)).toEqual([['A', 'C'], ['B']]);
    expect(source.mixed('showLabel')).toBeNull();
    source.set('cutMarginMm', 4);
    expect(over).toEqual({ cutMarginMm: 4 });
    /* A patch is one change, named by its first setting: the Materialfarbe. */
    groupPrintSource(shelf, all, {}, (_next, key) => { changed.push(key); })!
      .patch({ titleColour: '#3d7d3a', cartColour: '#3d7d3a', accentColour: '#3d7d3a' });
    expect(changed).toEqual(['cutMarginMm', 'titleColour']);
    const parts = groupPrintParts(shelf, all, over).filter((part) => part.collection);
    expect(parts.map((part) => part.options.settings.cutMarginMm)).toEqual([4, 4, 4]);
    expect(groupPrintSource(shelf, all, over, () => undefined)!.mixed('cutMarginMm')).toBeNull();
    /* Nothing written: each material keeps what it had. */
    expect(shelf[1]!.collection.print).toEqual({ cutMarginMm: 6 });
    expect(shelf[0]!.collection.print).toBeUndefined();
  });
});
