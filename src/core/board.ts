/**
 * A Tafel's grid, and the few things that can happen to it.
 *
 * All of it pure: a board goes in, a board comes out, and nothing here knows
 * about the store or the screen. The screen drags, the store writes, and what
 * both of them mean by „put this card in that field" is decided once, here,
 * where a test can hold it.
 */

import type { Board, Collection } from './types.ts';

/** What a Tafel is before anybody sized it: the shape most boards are. */
export const DEFAULT_BOARD: Board = { cols: 4, rows: 3, cells: Array(12).fill(null) };

export const MAX_BOARD_SIDE = 12;

/**
 * The board of a Sammlung, made whole.
 *
 * Whole means `cells` is exactly `cols * rows` long, whatever was stored: a
 * record written by hand, or by an older build, must not come out as a grid
 * with a field that cannot be dropped on. Too short is padded with free
 * fields; too long is cut.
 */
export function boardOf(collection: Pick<Collection, 'board'>): Board {
  const stored = collection.board ?? DEFAULT_BOARD;
  const cols = clampSide(stored.cols);
  const rows = clampSide(stored.rows);
  const cells = Array.from({ length: cols * rows }, (_, i) => stored.cells[i] ?? null);
  const zones = Array.from({ length: cols * rows }, (_, i) => stored.zones?.[i] ?? null);
  return { cols, rows, cells, zones };
}

function clampSide(n: number): number {
  return Number.isFinite(n) ? Math.min(MAX_BOARD_SIDE, Math.max(1, Math.round(n))) : DEFAULT_BOARD.cols;
}

/**
 * The same board at another size. A card keeps its row and column while both
 * still exist; one that falls off the edge comes off the board rather than
 * being squeezed into some other field it was never put in.
 */
export function resizeBoard(board: Board, cols: number, rows: number): Board {
  const next = { cols: clampSide(cols), rows: clampSide(rows) };
  const cells: (string | null)[] = Array(next.cols * next.rows).fill(null);
  const zones: (string | null)[] = Array(next.cols * next.rows).fill(null);
  for (let r = 0; r < Math.min(board.rows, next.rows); r += 1) {
    for (let c = 0; c < Math.min(board.cols, next.cols); c += 1) {
      cells[r * next.cols + c] = board.cells[r * board.cols + c] ?? null;
      zones[r * next.cols + c] = board.zones?.[r * board.cols + c] ?? null;
    }
  }
  return { ...next, cells, zones };
}

/** This field in that colour, or bare again with `null`. The card in it is not touched. */
export function paintZone(board: Board, index: number, colour: string | null): Board {
  if (index < 0 || index >= board.cells.length) return board;
  const zones = Array.from({ length: board.cells.length }, (_, i) => board.zones?.[i] ?? null);
  if (zones[index] === colour) return board;
  zones[index] = colour;
  return { ...board, zones };
}

/**
 * This card in that field.
 *
 * A card lies in one field at most, so it leaves the one it was in. A card
 * already lying in the target field is not lost: it takes the field the moved
 * card came from, which is what a swap is — or comes off the board when the
 * moved card came from off it.
 */
export function placeOn(board: Board, id: string, index: number): Board {
  if (index < 0 || index >= board.cells.length) return board;
  const cells = [...board.cells];
  const from = cells.indexOf(id);
  const other = cells[index] ?? null;
  if (from !== -1) cells[from] = other === id ? null : other;
  cells[index] = id;
  return { ...board, cells };
}

/** The card off the board, its field free. */
export function takeOff(board: Board, id: string): Board {
  if (!board.cells.includes(id)) return board;
  return { ...board, cells: board.cells.map((cell) => (cell === id ? null : cell)) };
}

/**
 * Which corners of a coloured field are the corners of its block.
 *
 * A group is fields of one colour side by side, and it should look like one
 * rounded block rather than a row of rounded fields: a corner is rounded only
 * where the block ends — no neighbour of the same colour on either side of
 * it. Written as a CSS border-radius, top-left first, for the field to wear.
 */
export function zoneCorners(board: Board, index: number, radius: string): string {
  const edges = zoneEdges(board, index);
  if (!edges) return '0';
  const { top, right, bottom, left } = edges;
  const corner = (a: boolean, b: boolean) => (a && b ? radius : '0');
  return [corner(top, left), corner(top, right), corner(bottom, right), corner(bottom, left)].join(' ');
}

/**
 * Which sides of a coloured field are the sides of its block: no neighbour
 * of the same colour beyond them. Null for a field with no colour. This is
 * where the block's edge steps in by half a gutter — so two blocks always
 * have a rinne between them and a block has air to the edge of the sheet —
 * and the corners above are the sides taken in pairs.
 */
export function zoneEdges(
  board: Board, index: number,
): { top: boolean; right: boolean; bottom: boolean; left: boolean } | null {
  const zone = board.zones?.[index];
  if (!zone) return null;
  const col = index % board.cols;
  const row = Math.floor(index / board.cols);
  const same = (c: number, r: number): boolean =>
    c >= 0 && c < board.cols && r >= 0 && r < board.rows
    && board.zones?.[r * board.cols + c] === zone;
  return {
    top: !same(col, row - 1), right: !same(col + 1, row),
    bottom: !same(col, row + 1), left: !same(col - 1, row),
  };
}

/** The zone layer's inset and corners, as CSS, for a cell that is `px` wide of gutter. */
export function zoneBox(board: Board, index: number, halfGutter: string, radius: string): { inset: string; borderRadius: string } | null {
  const edges = zoneEdges(board, index);
  if (!edges) return null;
  const side = (exposed: boolean) => (exposed ? halfGutter : '0');
  return {
    inset: `${side(edges.top)} ${side(edges.right)} ${side(edges.bottom)} ${side(edges.left)}`,
    borderRadius: zoneCorners(board, index, radius),
  };
}

/** The first free field, or -1 when there is none. */
export function firstFree(board: Board): number {
  return board.cells.indexOf(null);
}

/** Which cards lie on the board, in reading order. */
export function placedIds(board: Board): string[] {
  return board.cells.filter((cell): cell is string => cell !== null);
}
