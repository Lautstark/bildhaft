import { describe, expect, it } from 'vitest';
import {
  addGroup, boardOf, defaultAirMm, firstFree, groupsFromZones, placedIds, placeOn, removeGroup, resizeBoard, takeOff,
  updateGroup, zoneBox, zoneCorners, zoneMap, zonesOf,
} from '../../src/core/board.ts';
import type { Board } from '../../src/core/types.ts';

/**
 * A Tafel's grid. What is worth holding is what happens at the edges: a card
 * dropped where another lies, a grid made smaller than the cards on it, and a
 * record that does not add up — because each of those is a card silently gone.
 */
const grid = (cols: number, rows: number, ...placed: [string, number][]): Board => {
  const cells: (string | null)[] = Array(cols * rows).fill(null);
  for (const [id, at] of placed) cells[at] = id;
  return { cols, rows, cells };
};

describe('a Tafel that has not been sized', () => {
  it('is 4 × 3 and every field free', () => {
    expect(boardOf({})).toEqual({ ...grid(4, 3), groups: [] });
  });

  it('is made whole when the record does not add up', () => {
    expect(boardOf({ board: { cols: 2, rows: 2, cells: ['a'] } }).cells).toEqual(['a', null, null, null]);
    expect(boardOf({ board: { cols: 2, rows: 1, cells: ['a', 'b', 'c'] } }).cells).toEqual(['a', 'b']);
    expect(boardOf({ board: { cols: 0, rows: 40, cells: [] } })).toMatchObject({ cols: 1, rows: 12 });
  });
});

describe('a card into a field', () => {
  it('lies there, and nowhere else', () => {
    const next = placeOn(grid(2, 2, ['a', 0]), 'a', 3);
    expect(next.cells).toEqual([null, null, null, 'a']);
  });

  it('swaps with the card already lying there', () => {
    const next = placeOn(grid(2, 2, ['a', 0], ['b', 3]), 'a', 3);
    expect(next.cells).toEqual(['b', null, null, 'a']);
  });

  it('sends the card already lying there back to the tray when it came from there', () => {
    const next = placeOn(grid(2, 1, ['b', 1]), 'a', 1);
    expect(next.cells).toEqual([null, 'a']);
    expect(placedIds(next)).toEqual(['a']);
  });

  it('ignores a field that is not on the grid', () => {
    const board = grid(2, 1);
    expect(placeOn(board, 'a', 2)).toBe(board);
    expect(placeOn(board, 'a', -1)).toBe(board);
  });

  it('is a no-op dropped on its own field', () => {
    expect(placeOn(grid(2, 1, ['a', 1]), 'a', 1).cells).toEqual([null, 'a']);
  });
});

describe('a card off the board', () => {
  it('frees its field', () => {
    expect(takeOff(grid(2, 1, ['a', 1]), 'a').cells).toEqual([null, null]);
  });
  it('changes nothing for a card that was not on it', () => {
    const board = grid(2, 1, ['a', 1]);
    expect(takeOff(board, 'zzz')).toBe(board);
  });
});

describe('the grid at another size', () => {
  it('keeps every card in its row and column', () => {
    // a b c
    // d e f  → 2 wide: a b / d e ; c and f come off.
    const wide = grid(3, 2, ['a', 0], ['b', 1], ['c', 2], ['d', 3], ['e', 4], ['f', 5]);
    expect(resizeBoard(wide, 2, 2).cells).toEqual(['a', 'b', 'd', 'e']);
    // and back out again, the new column free.
    expect(resizeBoard(resizeBoard(wide, 2, 2), 3, 2).cells)
      .toEqual(['a', 'b', null, 'd', 'e', null]);
  });

  it('grows with free fields', () => {
    expect(resizeBoard(grid(1, 1, ['a', 0]), 2, 2).cells).toEqual(['a', null, null, null]);
    expect(firstFree(resizeBoard(grid(1, 1, ['a', 0]), 2, 2))).toBe(1);
  });

  it('will not be wider than twelve or narrower than one', () => {
    expect(resizeBoard(grid(2, 2), 40, 0)).toMatchObject({ cols: 12, rows: 1 });
  });
});

/**
 * A group: a rectangle of fields with a colour behind it. What is held is
 * that a group stays on the grid however it is moved or drawn out, that a
 * smaller grid cuts it rather than losing it, that the older colour-per-field
 * records come back as groups, and where a block's corners are rounded — the
 * one calculation a screen and a sheet both draw from.
 */
const y = '#fff1b8';
const b = '#d6e9fb';

describe('a group on a Tafel', () => {
  it('is made two by two on the first fields no group covers', () => {
    const one = addGroup(grid(4, 3), y);
    expect(one.groups).toEqual([{ col: 0, row: 0, cols: 2, rows: 2, colour: y }]);
    const two = addGroup(one, b);
    expect(two.groups![1]).toEqual({ col: 2, row: 0, cols: 2, rows: 2, colour: b });
    // A grid too small for two by two gets what fits.
    expect(addGroup(grid(1, 1), y).groups).toEqual([{ col: 0, row: 0, cols: 1, rows: 1, colour: y }]);
  });

  it('is moved and drawn out, and kept on the grid', () => {
    const one = addGroup(grid(4, 3), y);
    expect(updateGroup(one, 0, { col: 3, row: 2 }).groups![0]).toMatchObject({ col: 3, row: 2, cols: 1, rows: 1 });
    expect(updateGroup(one, 0, { col: -2, cols: 9, rows: 0 }).groups![0]).toMatchObject({ col: 0, cols: 4, rows: 1 });
    expect(updateGroup(one, 0, { colour: b }).groups![0].colour).toBe(b);
    expect(updateGroup(one, 0, {})).toBe(one);
    expect(updateGroup(one, 5, { col: 1 })).toBe(one);
    expect(removeGroup(one, 0).groups).toEqual([]);
  });

  it('is cut by a smaller grid and gone when nothing is left', () => {
    const one = updateGroup(addGroup(grid(4, 3), y), 0, { col: 2, row: 1, cols: 2, rows: 2 });
    expect(resizeBoard(one, 3, 3).groups![0]).toMatchObject({ col: 2, row: 1, cols: 1, rows: 2 });
    expect(resizeBoard(one, 2, 3).groups).toEqual([]);
  });

  it('colours the fields it covers, the last group over a field deciding', () => {
    const two = updateGroup(addGroup(addGroup(grid(3, 1), y), b), 1, { col: 1, row: 0, cols: 1, rows: 1 });
    expect(zonesOf(two)).toEqual([y, b, null]);
  });

  it('reads the older colour-per-field record as the largest rectangles', () => {
    // g g g      the L of one colour the real board wore
    // . . g
    const groups = groupsFromZones([y, y, y, null, null, y], 3, 2, 3, 2);
    expect(groups).toEqual([
      { col: 0, row: 0, cols: 3, rows: 1, colour: y },
      { col: 2, row: 1, cols: 1, rows: 1, colour: y },
    ]);
    expect(boardOf({ board: { cols: 3, rows: 2, cells: [], zones: [y, y, y, null, null, y] } }).groups).toEqual(groups);
  });
});

describe('the air around a card', () => {
  it('follows the field: less on a crowded sheet, more on a roomy one, never absurd', () => {
    expect(defaultAirMm(27)).toBe(3);   // seven across an A5
    expect(defaultAirMm(47.5)).toBe(5); // four across an A4
    expect(defaultAirMm(12)).toBe(2);
    expect(defaultAirMm(90)).toBe(5);
    expect(defaultAirMm(NaN)).toBe(4);
  });
  it('is the Tafel\'s own once set, and read back whole', () => {
    expect(boardOf({ board: { cols: 2, rows: 2, cells: [], airMm: 3 } }).airMm).toBe(3);
    expect(boardOf({ board: { cols: 2, rows: 2, cells: [] } })).not.toHaveProperty('airMm');
  });
});

describe('where a block ends', () => {
  const map = (cols: number, rows: number, zones: (string | null)[]) => ({ cols, rows, zones });

  it('rounds a block only at its own corners, and only against paper', () => {
    // y y .
    // y . .
    const m = map(3, 2, [y, y, null, y, null, null]);
    expect(zoneCorners(m, 0, 'R')).toBe('R 0 0 0');
    expect(zoneCorners(m, 1, 'R')).toBe('0 R R 0');
    expect(zoneCorners(m, 3, 'R')).toBe('0 0 R R');
    expect(zoneCorners(m, 2, 'R')).toBe('0');
  });

  it('keeps a corner square in the crook of another block', () => {
    // g g g      the real board: the grey L over the blue, where a rounded
    // b b g      blue corner left a notch against the grey's straight edge
    const g = '#e9ecef';
    const m = map(3, 2, [g, g, g, b, b, g]);
    // Blue's top-right corner sits in grey's crook: square. Its bottom-right
    // meets the edge of the sheet, which is paper: round. Blue's left field
    // has the sheet's edge on its left, so both its left corners are round —
    // two blocks stacked at an edge face each other with rounded corners.
    expect(zoneCorners(m, 4, 'R')).toBe('0 0 R 0');
    expect(zoneCorners(m, 3, 'R')).toBe('R 0 0 R');
    // Grey's own corners against the sheet's edges stay round — including the
    // ones that face blue along an edge.
    expect(zoneCorners(m, 0, 'R')).toBe('R 0 0 R');
    expect(zoneCorners(m, 5, 'R')).toBe('0 0 R R');
  });

  it('steps in by half a gutter on its own sides only, and reaches out where it goes on', () => {
    const m = map(3, 1, [y, y, null]);
    expect(zoneBox(m, 0, '1mm', '3mm')).toEqual({ inset: '1mm 0 1mm 1mm', borderRadius: '3mm 0 0 3mm' });
    expect(zoneBox(m, 1, '1mm', '3mm')).toEqual({ inset: '1mm 1mm 1mm 0', borderRadius: '0 3mm 3mm 0' });
    expect(zoneBox(m, 2, '1mm', '3mm')).toBeNull();
    expect(zoneBox(m, 0, '1mm', '3mm', '-0.3mm')!.inset).toBe('1mm -0.3mm 1mm 1mm');
    expect(zoneMap(addGroup(grid(2, 1), y)).zones).toEqual([y, y]);
  });
});
