/**
 * A Tafel's grid, and the few things that can happen to it.
 *
 * All of it pure: a board goes in, a board comes out, and nothing here knows
 * about the store or the screen. The screen drags, the store writes, and what
 * both of them mean by „put this card in that field" is decided once, here,
 * where a test can hold it.
 */

import type { Board, BoardGroup, Collection } from './types.ts';

/** What a Tafel is before anybody sized it: the shape most boards are. */
export const DEFAULT_BOARD: Board = { cols: 4, rows: 3, cells: Array(12).fill(null) };

export const MAX_BOARD_SIDE = 12;

/**
 * The board of a Sammlung, made whole.
 *
 * Whole means `cells` is exactly `cols * rows` long, whatever was stored: a
 * record written by hand, or by an older build, must not come out as a grid
 * with a field that cannot be dropped on. Too short is padded with free
 * fields; too long is cut. Groups are clipped to the grid, and a record that
 * still carries the older colour-per-field form has it read into groups.
 */
export function boardOf(collection: Pick<Collection, 'board'>): Board {
  const stored = collection.board ?? DEFAULT_BOARD;
  const cols = clampSide(stored.cols);
  const rows = clampSide(stored.rows);
  const cells = Array.from({ length: cols * rows }, (_, i) => stored.cells[i] ?? null);
  const groups = stored.groups
    ? clipGroups(stored.groups, cols, rows)
    : stored.zones ? groupsFromZones(stored.zones, stored.cols, stored.rows, cols, rows) : [];
  return { cols, rows, cells, groups };
}

function clampSide(n: number): number {
  return Number.isFinite(n) ? Math.min(MAX_BOARD_SIDE, Math.max(1, Math.round(n))) : DEFAULT_BOARD.cols;
}

/** Groups kept inside a grid: cut where they reach past it, dropped where nothing is left. */
function clipGroups(groups: BoardGroup[], cols: number, rows: number): BoardGroup[] {
  return groups.flatMap((g) => {
    const col = Math.max(0, Math.round(g.col));
    const row = Math.max(0, Math.round(g.row));
    const width = Math.min(Math.round(g.cols), cols - col);
    const height = Math.min(Math.round(g.rows), rows - row);
    if (!(width >= 1 && height >= 1) || typeof g.colour !== 'string' || !g.colour) return [];
    return [{ col, row, cols: width, rows: height, colour: g.colour }];
  });
}

/**
 * Colour-per-field, as it was stored before there were groups, read as
 * groups: the largest rectangle of one colour from each field not yet in
 * one, row-major. An L of one colour comes out as two rectangles, which draw
 * as the one block they were.
 */
export function groupsFromZones(
  zones: (string | null)[], storedCols: number, storedRows: number, cols: number, rows: number,
): BoardGroup[] {
  const at = (c: number, r: number) => (c < storedCols && r < storedRows ? zones[r * storedCols + c] ?? null : null);
  const taken = new Set<string>();
  const groups: BoardGroup[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const colour = at(c, r);
      if (!colour || taken.has(`${c},${r}`)) continue;
      let width = 1;
      while (c + width < cols && at(c + width, r) === colour && !taken.has(`${c + width},${r}`)) width += 1;
      let height = 1;
      while (r + height < rows) {
        let whole = true;
        for (let dc = 0; dc < width; dc += 1) {
          if (at(c + dc, r + height) !== colour || taken.has(`${c + dc},${r + height}`)) { whole = false; break; }
        }
        if (!whole) break;
        height += 1;
      }
      for (let dr = 0; dr < height; dr += 1) for (let dc = 0; dc < width; dc += 1) taken.add(`${c + dc},${r + dr}`);
      groups.push({ col: c, row: r, cols: width, rows: height, colour });
    }
  }
  return groups;
}

/**
 * The same board at another size. A card keeps its row and column while both
 * still exist; one that falls off the edge comes off the board rather than
 * being squeezed into some other field it was never put in. A group is cut
 * where the grid ends and gone when nothing of it is left.
 */
export function resizeBoard(board: Board, cols: number, rows: number): Board {
  const next = { cols: clampSide(cols), rows: clampSide(rows) };
  const cells: (string | null)[] = Array(next.cols * next.rows).fill(null);
  for (let r = 0; r < Math.min(board.rows, next.rows); r += 1) {
    for (let c = 0; c < Math.min(board.cols, next.cols); c += 1) {
      cells[r * next.cols + c] = board.cells[r * board.cols + c] ?? null;
    }
  }
  return { ...next, cells, groups: clipGroups(board.groups ?? [], next.cols, next.rows) };
}

/**
 * A new group, two by two where the grid allows it, on the first field no
 * group covers yet — or at the top left when every field is under one.
 */
export function addGroup(board: Board, colour: string): Board {
  const covered = new Set(zonesOf(board).flatMap((z, i) => (z ? [i] : [])));
  let start = board.cells.findIndex((_, i) => !covered.has(i));
  if (start === -1) start = 0;
  const col = start % board.cols;
  const row = Math.floor(start / board.cols);
  const group: BoardGroup = {
    col, row, colour,
    cols: Math.min(2, board.cols - col),
    rows: Math.min(2, board.rows - row),
  };
  return { ...board, groups: [...(board.groups ?? []), group] };
}

/** This group, changed — and kept on the grid, at least one field big. */
export function updateGroup(board: Board, index: number, patch: Partial<BoardGroup>): Board {
  const groups = board.groups ?? [];
  const before = groups[index];
  if (!before) return board;
  const merged = { ...before, ...patch };
  const col = Math.min(Math.max(0, Math.round(merged.col)), board.cols - 1);
  const row = Math.min(Math.max(0, Math.round(merged.row)), board.rows - 1);
  const after: BoardGroup = {
    col, row, colour: merged.colour,
    cols: Math.min(Math.max(1, Math.round(merged.cols)), board.cols - col),
    rows: Math.min(Math.max(1, Math.round(merged.rows)), board.rows - row),
  };
  if ((Object.keys(after) as (keyof BoardGroup)[]).every((k) => after[k] === before[k])) return board;
  return { ...board, groups: groups.map((g, i) => (i === index ? after : g)) };
}

export function removeGroup(board: Board, index: number): Board {
  const groups = board.groups ?? [];
  if (!groups[index]) return board;
  return { ...board, groups: groups.filter((_, i) => i !== index) };
}

/**
 * The colour behind each field, row-major, from the groups: the last group
 * laid over a field decides it. This is what the screen and the sheet draw
 * from, and what makes two touching groups of one colour one block.
 */
export function zonesOf(board: Pick<Board, 'cols' | 'rows' | 'groups'>): (string | null)[] {
  const zones: (string | null)[] = Array(board.cols * board.rows).fill(null);
  for (const g of board.groups ?? []) {
    for (let r = g.row; r < Math.min(board.rows, g.row + g.rows); r += 1) {
      for (let c = g.col; c < Math.min(board.cols, g.col + g.cols); c += 1) zones[r * board.cols + c] = g.colour;
    }
  }
  return zones;
}

/** The colours as the drawing needs them: which colour lies on which field of a grid this size. */
export interface ZoneMap { cols: number; rows: number; zones: (string | null)[] }

export const zoneMap = (board: Pick<Board, 'cols' | 'rows' | 'groups'>): ZoneMap =>
  ({ cols: board.cols, rows: board.rows, zones: zonesOf(board) });

/**
 * Which sides of a coloured field are the sides of its block: no neighbour
 * of the same colour beyond them. Null for a field with no colour. This is
 * where the block's edge steps in by half a gutter — so two blocks always
 * have a rinne between them and a block has air to the edge of the sheet.
 */
export function zoneEdges(
  map: ZoneMap, index: number,
): { top: boolean; right: boolean; bottom: boolean; left: boolean } | null {
  const zone = map.zones[index];
  if (!zone) return null;
  const col = index % map.cols;
  const row = Math.floor(index / map.cols);
  const same = (c: number, r: number): boolean => colourAt(map, c, r) === zone;
  return {
    top: !same(col, row - 1), right: !same(col + 1, row),
    bottom: !same(col, row + 1), left: !same(col - 1, row),
  };
}

function colourAt(map: ZoneMap, c: number, r: number): string | null {
  return c >= 0 && c < map.cols && r >= 0 && r < map.rows ? map.zones[r * map.cols + c] ?? null : null;
}

/**
 * Which corners of a coloured field are rounded.
 *
 * A corner is a corner of the block when both its sides are: no neighbour of
 * the same colour on either. And it is rounded only when it is a corner *on
 * paper* — at least one of the two fields beside it bare. Where both are
 * other blocks, the corner sits in the crook of an L or at a T of blocks,
 * and a rounded corner there left a notch of paper against the other
 * block's straight inner edge. Square there, the blocks meet along a rinne.
 * Written as a CSS border-radius, top-left first, for the field to wear.
 */
export function zoneCorners(map: ZoneMap, index: number, radius: string): string {
  const edges = zoneEdges(map, index);
  if (!edges) return '0';
  const col = index % map.cols;
  const row = Math.floor(index / map.cols);
  const bare = (c: number, r: number) => colourAt(map, c, r) === null;
  const corner = (vertical: boolean, horizontal: boolean, dc: number, dr: number) =>
    (vertical && horizontal && (bare(col, row + dr) || bare(col + dc, row)) ? radius : '0');
  return [
    corner(edges.top, edges.left, -1, -1), corner(edges.top, edges.right, 1, -1),
    corner(edges.bottom, edges.right, 1, 1), corner(edges.bottom, edges.left, -1, 1),
  ].join(' ');
}

/**
 * The colour layer's inset and corners, as CSS. A side where the block ends
 * steps in by half a gutter; a side where it goes on reaches *out* by a hair
 * (`overlap`), so two neighbouring layers overlap instead of meeting edge to
 * edge — which, scaled in a preview, drew a white seam through every block.
 */
export function zoneBox(
  map: ZoneMap, index: number, halfGutter: string, radius: string, overlap = '0',
): { inset: string; borderRadius: string } | null {
  const edges = zoneEdges(map, index);
  if (!edges) return null;
  const side = (exposed: boolean) => (exposed ? halfGutter : overlap);
  return {
    inset: `${side(edges.top)} ${side(edges.right)} ${side(edges.bottom)} ${side(edges.left)}`,
    borderRadius: zoneCorners(map, index, radius),
  };
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

/** The first free field, or -1 when there is none. */
export function firstFree(board: Board): number {
  return board.cells.indexOf(null);
}

/** Which cards lie on the board, in reading order. */
export function placedIds(board: Board): string[] {
  return board.cells.filter((cell): cell is string => cell !== null);
}
