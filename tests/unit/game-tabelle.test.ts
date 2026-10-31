import { describe, expect, it } from 'vitest';
import { GAME_FIELD_MM, tabelleFits, tabelleGeometry } from '../../src/ui/printSheet.ts';
import { cardsOfGame, tabelleOf, withoutGameCard } from '../../src/core/game.ts';
import type { GameBook } from '../../src/core/types.ts';

/**
 * Ein Spiel · Tabelle: Zeile × Spalte at the one field of every Spiel, and a
 * book whose places keep their columns while their cards come and go.
 */

const settings = { paper: 'a4' as const, cutMarginMm: 3, showLabel: false, labelSizePt: 10, punch: null };
const page = { width: 277, height: 194 };
const reserve = 23;
const shape = (spalten: number, zeilen: number) => ({ spalten, zeilen, platz: spalten * zeilen });

describe('a Tabelle on its sheet', () => {
  it('prints at the one Spiel field while Ablage and table stand side by side', () => {
    for (const [m, n] of [[2, 2], [3, 3], [4, 3], [3, 4], [3, 5]] as const) {
      expect(tabelleFits(settings, page, reserve, shape(m, n))).toBe(true);
      expect(tabelleGeometry(settings, page, reserve, shape(m, n)).fieldW).toBe(GAME_FIELD_MM);
    }
    // Four by four needs a third Ablage column, and the page has no room for it.
    expect(tabelleFits(settings, page, reserve, shape(4, 4))).toBe(false);
    expect(tabelleFits(settings, page, reserve, shape(5, 3))).toBe(false);
  });

  it('keeps the Ablage as tall as the table where it can', () => {
    // Three rows under the heads: the Ablage fills those four rows, nine dots in three columns.
    const geo = tabelleGeometry(settings, page, reserve, shape(3, 3));
    expect(geo.units).toBe(4);
    expect(geo.lagerCols).toBe(3);
    // A Tabelle too wide for that grows its Ablage downward instead.
    expect(tabelleGeometry(settings, page, reserve, shape(4, 3)).lagerCols).toBe(2);
  });
});

describe('a Tabelle as a book', () => {
  const book: GameBook = {
    tabelle: true,
    rows: [
      { id: 'kopf', zellen: [{ karte: 'pulli', platz: false }, { karte: 'tasse', platz: false }] },
      { id: 'r1', zellen: [{ karte: 'rot', platz: false }, { karte: 'rotpulli', platz: true }, { karte: '', platz: true }] },
    ],
  };

  it('keeps a place where a card is taken out, and the columns stay where they are', () => {
    const next = withoutGameCard(book, 'rotpulli');
    expect(next.tabelle).toBe(true);
    expect(tabelleOf(next).zeilen[0]!.felder).toEqual(['', '']);
    expect(tabelleOf(next).spalten).toEqual(['pulli', 'tasse']);
  });

  it('keeps an empty column: only the size button or a bin takes a column away', () => {
    const next = withoutGameCard(book, 'tasse');
    expect(tabelleOf(next).spalten).toEqual(['pulli', '']);
    expect(tabelleOf(next).zeilen[0]!.felder).toEqual(['rotpulli', '']);
  });

  it('counts no card for a place still to be chosen', () => {
    expect(cardsOfGame(book)).toEqual(['pulli', 'tasse', 'rot', 'rotpulli']);
  });
});
