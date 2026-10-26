import { describe, expect, it } from 'vitest';
import { GAME_FIELD_MM, GAME_SCALE, gameFits, gameGeometry } from '../../src/ui/printSheet.ts';

/**
 * One card size for every Spiel.
 *
 * The field used to be the biggest the sheet allowed, so every game came out
 * a different size — 31 mm here, 44 there — and cards could not be shared or
 * compared. Now the field is fixed and the game is what is limited: Bearbeiten
 * offers a cell or a row only while gameFits() says the sheet holds it.
 */

const settings = { paper: 'a4' as const, cutMarginMm: 3, showLabel: false, labelSizePt: 10, punch: null };
/* A4 landscape as the sheet measures it: 277 mm wide, 167 mm left for the game. */
const page = { width: 277, height: 190 };
const reserve = 23;
const pairs = (n: number) => ({ units: n, zellen: 2, platz: n });

describe('a Spiel at its one field size', () => {
  it('prints every game that fits at exactly the one field', () => {
    for (const shape of [pairs(3), pairs(8), { units: 5, zellen: 6, platz: 5 }, { units: 4, zellen: 4, platz: 12 }]) {
      expect(gameFits(settings, page, reserve, shape)).toBe(true);
      expect(gameGeometry(settings, page, reserve, shape).fieldW).toBe(GAME_FIELD_MM);
    }
  });

  it('scales the field with the paper, so a game holds as much on A5 as on A4', () => {
    const a5 = { ...settings, paper: 'a5' as const };
    const small = { width: page.width * 0.7, height: page.height * 0.7 };
    expect(gameGeometry(a5, small, reserve * 0.7, pairs(8)).fieldW).toBeCloseTo(GAME_FIELD_MM * GAME_SCALE.a5);
    expect(gameFits(a5, small, reserve * 0.7, pairs(8))).toBe(true);
  });

  it('fills a column to the foot of the page before it starts the next, the Ablage too', () => {
    // Five rows of 30 mm stand under each other on A4: that is the raster,
    // however many rows the game has. A sixth row begins a second column on
    // its own — five and one, not three and three.
    for (const n of [3, 5, 6]) expect(gameGeometry(settings, page, reserve, pairs(n)).units).toBe(5);
    // And the Ablage fills it the same way: nine cards are five and four,
    // not three columns of three beside three rows of the game.
    expect(gameGeometry(settings, page, reserve, { units: 3, zellen: 4, platz: 9 }).lagerCols).toBe(2);
    expect(gameGeometry(settings, page, reserve, pairs(5)).lagerCols).toBe(1);
  });

  it('runs many short rows in columns before calling the sheet full', () => {
    expect(gameFits(settings, page, reserve, pairs(10))).toBe(true);
    expect(gameFits(settings, page, reserve, pairs(11))).toBe(false);
  });

  it('counts the Ablage against a row: a Platzhalter can be one cell too many where a picture is not', () => {
    // Five Muster rows of five cells, one Platzhalter each: one Ablage column.
    const muster = { units: 5, zellen: 5, platz: 5 };
    expect(gameFits(settings, page, reserve, muster)).toBe(true);
    // A sixth picture still fits beside it…
    expect(gameFits(settings, page, reserve, { ...muster, zellen: 6 })).toBe(true);
    // …a sixth cell that is a Platzhalter opens a second Ablage column, and does not.
    expect(gameFits(settings, page, reserve, { ...muster, zellen: 6, platz: 6 })).toBe(false);
  });

  it('still prints a game built before the limit, shrunk to its sheet', () => {
    const full = { units: 6, zellen: 7, platz: 6 };
    expect(gameFits(settings, page, reserve, full)).toBe(false);
    const geo = gameGeometry(settings, page, reserve, full);
    expect(geo.fieldW).toBeLessThan(GAME_FIELD_MM);
    expect(geo.fieldW).toBeGreaterThan(20);
  });

  it('keeps a game that lost a row of room in one column, a little smaller, rather than halving it', () => {
    /* Her „Wohin gehört es genau?" — five sorting rows of 1 + 3 — on a sheet
       whose punched top and credit line leave room for four rows: a fifth
       in a second column made the sheet too wide and every card 15 mm. */
    const sorting = { units: 5, zellen: 4, platz: 15 };
    const lower = 33;
    expect(gameGeometry(settings, page, lower, pairs(4)).units).toBe(4);
    expect(gameFits(settings, page, lower, sorting)).toBe(false);
    const geo = gameGeometry(settings, page, lower, sorting);
    expect(geo.units).toBe(5);
    expect(geo.fieldW).toBeGreaterThan(25);
  });
});
