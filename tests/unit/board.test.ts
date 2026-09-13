import { describe, expect, it } from 'vitest';
import { boardOf, firstFree, placedIds, placeOn, resizeBoard, takeOff } from '../../src/core/board.ts';
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
    expect(boardOf({})).toEqual(grid(4, 3));
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
