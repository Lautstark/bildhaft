import { describe, expect, it } from 'vitest';
import { boardOf, firstFree, paintZone, placedIds, placeOn, resizeBoard, takeOff, zoneBox, zoneCorners } from '../../src/core/board.ts';
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
    expect(boardOf({})).toEqual({ ...grid(4, 3), zones: Array(12).fill(null) });
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
 * A colour behind a group of fields. It belongs to the field, not the card:
 * the block says „the colours go here" and stays when a card moves. What is
 * held is that painting never touches a card, that a smaller grid keeps the
 * colours of the fields it keeps, and that a block is rounded only where it
 * ends — the one calculation a screen and a sheet both draw from.
 */
describe('a colour behind fields', () => {
  it('paints the field and leaves the card in it alone', () => {
    const board = placeOn(grid(2, 2), 'a', 1);
    const next = paintZone(board, 1, '#fff3bf');
    expect(next.zones).toEqual([null, '#fff3bf', null, null]);
    expect(next.cells).toEqual(board.cells);
    expect(paintZone(next, 1, '#fff3bf')).toBe(next);
    expect(paintZone(next, 1, null).zones).toEqual([null, null, null, null]);
  });

  it('keeps its colours through a resize, like the cards', () => {
    const painted = paintZone(paintZone(grid(3, 2), 0, 'y'), 2, 'y');
    expect(resizeBoard(painted, 2, 2).zones).toEqual(['y', null, null, null]);
  });

  it('rounds a block only at its own corners', () => {
    // y y .
    // y . .
    let board = grid(3, 2);
    for (const i of [0, 1, 3]) board = paintZone(board, i, 'y');
    expect(zoneCorners(board, 0, 'R')).toBe('R 0 0 0');
    expect(zoneCorners(board, 1, 'R')).toBe('0 R R 0');
    expect(zoneCorners(board, 3, 'R')).toBe('0 0 R R');
    expect(zoneCorners(board, 2, 'R')).toBe('0');
    // A different colour beside it is an end, not a neighbour.
    expect(zoneCorners(paintZone(board, 2, 'g'), 1, 'R')).toBe('0 R R 0');
  });
});

describe('where a block ends', () => {
  it('steps in by half a gutter on its own sides only', () => {
    // y y .
    let board = paintZone(paintZone(grid(3, 1), 0, 'y'), 1, 'y');
    expect(zoneBox(board, 0, '1mm', '3mm')).toEqual({ inset: '1mm 0 1mm 1mm', borderRadius: '3mm 0 0 3mm' });
    expect(zoneBox(board, 1, '1mm', '3mm')).toEqual({ inset: '1mm 1mm 1mm 0', borderRadius: '0 3mm 3mm 0' });
    expect(zoneBox(board, 2, '1mm', '3mm')).toBeNull();
  });
});
