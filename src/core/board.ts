/**
 * A Tafel's grid, and the few things that can happen to it.
 *
 * All of it pure: a board goes in, a board comes out, and nothing here knows
 * about the store or the screen. The screen drags, the store writes, and what
 * both of them mean by „put this card in that field" is decided once, here,
 * where a test can hold it.
 */

import type { Board, Collection, ZoneStyle } from './types.ts';

/** What a Tafel is before anybody sized it: the shape most boards are. */
export const DEFAULT_BOARD: Board = { cols: 4, rows: 3, cells: Array(12).fill(null) };

export const MAX_BOARD_SIDE = 12;

/**
 * The board of a Sammlung, made whole.
 *
 * Whole means `cells` and `zones` are exactly `cols * rows` long, whatever
 * was stored: a record written by hand, or by an older build, must not come
 * out as a grid with a field that cannot be dropped on. Too short is padded
 * with free fields; too long is cut. A record still carrying groups as
 * rectangles, or a colour per field, is read into a group per field with a
 * style, and written back that way.
 */
export function boardOf(collection: Pick<Collection, 'board'>): Board {
  const stored = collection.board ?? DEFAULT_BOARD;
  const cols = clampSide(stored.cols);
  const rows = clampSide(stored.rows);
  const cells = Array.from({ length: cols * rows }, (_, i) => stored.cells[i] ?? null);
  const air = typeof stored.airMm === 'number' && Number.isFinite(stored.airMm) && stored.airMm >= 0
    ? { airMm: Math.min(20, stored.airMm) } : {};
  const zones = zonesFor(stored, cols, rows);
  return { cols, rows, cells, zones, styles: stylesFor(stored, zones), ...air };
}

function clampSide(n: number): number {
  return Number.isFinite(n) ? Math.min(MAX_BOARD_SIDE, Math.max(1, Math.round(n))) : DEFAULT_BOARD.cols;
}

/**
 * The colour behind each field, whole for a grid this size: exactly
 * `cols * rows` entries, `null` where a field is bare. Reads the current form
 * (`zones`), and for records written while groups were rectangles derives it
 * from them, the last group over a field deciding.
 */
function zonesFor(stored: Partial<Board>, cols: number, rows: number): (string | null)[] {
  if (stored.zones) {
    const storedCols = clampSide(stored.cols ?? cols);
    const storedRows = clampSide(stored.rows ?? rows);
    return Array.from({ length: cols * rows }, (_, i) => {
      const c = i % cols; const r = Math.floor(i / cols);
      return c < storedCols && r < storedRows ? stored.zones![r * storedCols + c] ?? null : null;
    });
  }
  const zones: (string | null)[] = Array(cols * rows).fill(null);
  for (const g of stored.groups ?? []) {
    if (typeof g.colour !== 'string' || !g.colour) continue;
    for (let r = Math.max(0, g.row); r < Math.min(rows, g.row + g.rows); r += 1) {
      for (let c = Math.max(0, g.col); c < Math.min(cols, g.col + g.cols); c += 1) zones[r * cols + c] = g.colour;
    }
  }
  return zones;
}

/**
 * The style of every group the fields name, whole: a key in `zones` that has
 * no style yet is one of the two older forms, where the key *was* the colour,
 * and gets that colour as its fill. A style no field names any more is
 * dropped.
 */
function stylesFor(stored: Partial<Board>, zones: (string | null)[]): Record<string, ZoneStyle> {
  const styles: Record<string, ZoneStyle> = {};
  for (const id of zones) {
    if (!id || styles[id]) continue;
    const stored_ = stored.styles?.[id];
    styles[id] = stored_ ? trim(stored_) : looksLikeColour(id) ? { fill: id } : {};
  }
  return styles;
}

const looksLikeColour = (s: string): boolean => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(s);

/** A style with its blanks left out, so an empty one is `{}` and compares as such. */
function trim(style: ZoneStyle): ZoneStyle {
  const out: ZoneStyle = {};
  const name = style.name?.trim();
  if (name) out.name = name;
  if (style.frame) out.frame = style.frame;
  if (style.fill) out.fill = style.fill;
  return out;
}

/** Whether a style draws nothing at all — no name, no frame, no fill. */
export const isBare = (style: ZoneStyle | undefined): boolean =>
  !style || (!style.name?.trim() && !style.frame && !style.fill);

/**
 * The air around a card when nobody has said: a ninth of the field, held
 * between 2 and 5 mm. Seven fields across an A5 are 27 mm each and get 3;
 * four across an A4 are 47 mm and get 5. A fixed 4 was a third of the card
 * on the first and a hairline on a wall-sized A3.
 */
export function defaultAirMm(fieldMm: number): number {
  if (!Number.isFinite(fieldMm) || fieldMm <= 0) return 4;
  return Math.min(5, Math.max(2, Math.round(fieldMm / 9)));
}

/**
 * The same board at another size. A card keeps its row and column while both
 * still exist; one that falls off the edge comes off the board rather than
 * being squeezed into some other field it was never put in. A field keeps
 * its colour the same way.
 */
export function resizeBoard(board: Board, cols: number, rows: number): Board {
  const next = { cols: clampSide(cols), rows: clampSide(rows) };
  const from = zonesOf(board);
  const cells: (string | null)[] = Array(next.cols * next.rows).fill(null);
  const zones: (string | null)[] = Array(next.cols * next.rows).fill(null);
  for (let r = 0; r < Math.min(board.rows, next.rows); r += 1) {
    for (let c = 0; c < Math.min(board.cols, next.cols); c += 1) {
      cells[r * next.cols + c] = board.cells[r * board.cols + c] ?? null;
      zones[r * next.cols + c] = from[r * board.cols + c] ?? null;
    }
  }
  const { groups: _groups, ...rest } = board;
  return tidy({ ...rest, ...next, cells, zones });
}

/**
 * These fields into the group `id`, drawn like `style`. The one act behind
 * every change in the group panel: the marked fields join the group (a field
 * is in one group at most, so it leaves the one it was in) and the group
 * takes this style, whole. A style with nothing in it dissolves the group —
 * its fields go bare — because a group nobody can see is not a group.
 * The cards in the fields are not touched.
 */
export function setZone(board: Board, indices: Iterable<number>, id: string, style: ZoneStyle): Board {
  const zones = zonesOf(board);
  const styles = { ...stylesOf(board) };
  const next = trim(style);
  let changed = JSON.stringify(styles[id] ?? null) !== JSON.stringify(next);
  for (const index of indices) {
    if (index < 0 || index >= zones.length || zones[index] === id) continue;
    zones[index] = id;
    changed = true;
  }
  if (!changed) return board;
  styles[id] = next;
  const { groups: _groups, ...rest } = board;
  return tidy({ ...rest, zones, styles });
}

/** The group gone: its fields bare, its style forgotten. */
export function dissolveZone(board: Board, id: string): Board {
  const zones = zonesOf(board);
  if (!zones.includes(id)) return board;
  const { groups: _groups, ...rest } = board;
  return tidy({ ...rest, zones: zones.map((z) => (z === id ? null : z)), styles: stylesOf(board) });
}

/** A key no group on this board has. Short and stable, so a test can name it. */
export function newZoneId(board: Pick<Board, 'zones' | 'styles'>): string {
  const taken = new Set([...(board.zones ?? []), ...Object.keys(board.styles ?? {})]);
  let n = 1;
  while (taken.has(`g${n}`)) n += 1;
  return `g${n}`;
}

/**
 * Whole again after a change: a group whose style draws nothing loses its
 * fields, and a style no field names is dropped. Every writer ends here, so
 * what is stored never carries a group that is not on the board.
 */
function tidy(board: Board): Board {
  const styles = board.styles ?? {};
  const zones = (board.zones ?? []).map((id) => (id && !isBare(styles[id]) ? id : null));
  const kept: Record<string, ZoneStyle> = {};
  for (const id of zones) if (id && !kept[id]) kept[id] = trim(styles[id]);
  return { ...board, zones, styles: kept };
}

/** Each group's style, whole — see `stylesFor()`. */
export function stylesOf(board: Pick<Board, 'cols' | 'rows' | 'zones' | 'groups' | 'styles'>): Record<string, ZoneStyle> {
  return stylesFor(board, zonesOf(board));
}

/** The group of each field, row-major and whole. */
export function zonesOf(board: Pick<Board, 'cols' | 'rows' | 'zones' | 'groups'>): (string | null)[] {
  return zonesFor(board, board.cols, board.rows);
}

/** The groups as the drawing needs them: which group lies on which field of a grid this size, and how each is drawn. */
export interface ZoneMap { cols: number; rows: number; zones: (string | null)[]; styles: Record<string, ZoneStyle> }

export const zoneMap = (board: Pick<Board, 'cols' | 'rows' | 'zones' | 'groups' | 'styles'>): ZoneMap =>
  ({ cols: board.cols, rows: board.rows, zones: zonesOf(board), styles: stylesOf(board) });

/**
 * The block a field belongs to: every field of the same group that can be
 * reached from it over shared sides, in reading order. What a click on a
 * block selects, so a group is restyled or dissolved as one.
 */
export function blockAt(map: ZoneMap, index: number): number[] {
  const colour = map.zones[index];
  if (!colour) return [];
  const seen = new Set<number>([index]);
  const queue = [index];
  while (queue.length > 0) {
    const i = queue.pop()!;
    const c = i % map.cols; const r = Math.floor(i / map.cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc; const nr = r + dr;
      if (nc < 0 || nc >= map.cols || nr < 0 || nr >= map.rows) continue;
      const n = nr * map.cols + nc;
      if (!seen.has(n) && map.zones[n] === colour) { seen.add(n); queue.push(n); }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

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
 * paper* — at least one of the two fields beside it bare, the sheet's edge
 * counting as bare. Where both are other blocks, the corner sits in the
 * crook of an L or at a T of blocks, and a rounded corner there left a notch
 * of paper against the other block's straight inner edge. Square there, the
 * blocks meet along a rinne. Written as a CSS border-radius, top-left first.
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

/** The four corners of a field, as CSS names them. */
export type Corner = 'tl' | 'tr' | 'br' | 'bl';

/**
 * The layer's inset and corners, as CSS. A side where the block ends steps in
 * by half a gutter; a side where it goes on reaches *out* by a hair
 * (`overlap`), so two neighbouring layers overlap instead of meeting edge to
 * edge — which, scaled in a preview, drew a white seam through every block.
 *
 * `clipPath` is set where the field has an inner corner of its block (see
 * `zoneCrooks()`): there the layer, a rectangle, would reach out past the
 * two neighbours' stepped-in edges into the crook, and is cut back to them.
 */
export function zoneBox(
  map: ZoneMap, index: number, halfGutter: string, radius: string, overlap = '0',
): { inset: string; borderRadius: string; clipPath: string | null; crooks: Corner[] } | null {
  const edges = zoneEdges(map, index);
  if (!edges) return null;
  const side = (exposed: boolean) => (exposed ? halfGutter : overlap);
  const crooks = zoneCrooks(map, index);
  return {
    inset: `${side(edges.top)} ${side(edges.right)} ${side(edges.bottom)} ${side(edges.left)}`,
    borderRadius: zoneCorners(map, index, radius),
    clipPath: zoneClip(crooks, `calc(${halfGutter} - (${overlap}))`),
    crooks,
  };
}

/**
 * The inner corners of the block at this field: a corner whose two sides both
 * go on to fields of the group while the field across the corner is not in
 * it. The block turns there — an L, a T, a U — and two things follow for the
 * drawing: this field's layer must not fill the crook, and the frame, which
 * each neighbour draws along its own stepped-in edge only, has to be carried
 * around the corner by this field. Empty for a field with no group.
 */
export function zoneCrooks(map: ZoneMap, index: number): Corner[] {
  const zone = map.zones[index];
  if (!zone) return [];
  const col = index % map.cols;
  const row = Math.floor(index / map.cols);
  const same = (dc: number, dr: number): boolean => colourAt(map, col + dc, row + dr) === zone;
  const crook = (dc: number, dr: number): boolean => same(dc, 0) && same(0, dr) && !same(dc, dr);
  const out: Corner[] = [];
  if (crook(-1, -1)) out.push('tl');
  if (crook(1, -1)) out.push('tr');
  if (crook(1, 1)) out.push('br');
  if (crook(-1, 1)) out.push('bl');
  return out;
}

/**
 * The layer with a square of side `k` cut from each inner corner, as a CSS
 * polygon; null when there is nothing to cut. `k` is the half gutter plus the
 * overlap: exactly as far as the neighbours' layers step in, so that the
 * cut edge lies along their edges.
 */
export function zoneClip(crooks: Corner[], k: string): string | null {
  if (crooks.length === 0) return null;
  const has = (c: Corner) => crooks.includes(c);
  const far = `calc(100% - ${k})`;
  const pts: string[] = [];
  pts.push(has('tl') ? `${k} 0` : '0 0');
  pts.push(...(has('tr') ? [`${far} 0`, `${far} ${k}`, `100% ${k}`] : ['100% 0']));
  pts.push(...(has('br') ? [`100% ${far}`, `${far} ${far}`, `${far} 100%`] : ['100% 100%']));
  pts.push(...(has('bl') ? [`${k} 100%`, `${k} ${far}`, `0 ${far}`] : ['0 100%']));
  if (has('tl')) pts.push(`0 ${k}`, `${k} ${k}`);
  return `polygon(${pts.join(', ')})`;
}

/**
 * The piece of frame that turns an inner corner, as CSS for a small box in
 * the field's corner: where it sits, how big it is, and where inside it the
 * two strips of frame run. The neighbours' frames end at their own stepped-in
 * edges, a half gutter and a border short of each other; this box, laid in
 * the crook of the field across the corner, draws the two missing ends and
 * the corner they meet in.
 */
export function zoneJoint(
  corner: Corner, halfGutter: string, overlap: string, border: string,
): { position: Record<string, string>; size: string; x: string; y: string } {
  const k = `calc(${halfGutter} - (${overlap}))`;
  const vertical = corner === 'tl' || corner === 'bl';
  const upper = corner === 'tl' || corner === 'tr';
  const position: Record<string, string> = {
    [upper ? 'top' : 'bottom']: overlap,
    [vertical ? 'left' : 'right']: overlap,
  };
  return {
    position,
    size: `calc(${k} + ${border})`,
    // The strip of frame that runs on: at `k` on the side the frame comes from, at 0 on the other.
    x: vertical ? k : '0',
    y: upper ? k : '0',
  };
}

/**
 * The frame's width on each side of a field's layer, as a CSS border-width:
 * `width` where the block ends, nothing where it goes on to the neighbour —
 * so the frame runs around the block and not through it.
 */
export function zoneBorder(map: ZoneMap, index: number, width: string): string | null {
  const edges = zoneEdges(map, index);
  if (!edges) return null;
  const side = (exposed: boolean) => (exposed ? width : '0');
  return `${side(edges.top)} ${side(edges.right)} ${side(edges.bottom)} ${side(edges.left)}`;
}

/**
 * The field a group's name is written on: the first of its fields in reading
 * order, which is the leftmost field of its top row — where the shield sits
 * on the block's edge. -1 for a group not on the board.
 */
export function labelField(map: ZoneMap, id: string): number {
  return map.zones.indexOf(id);
}

/**
 * The colour a group's name is written in: its frame's, or its fill darkened
 * far enough to read on paper, or a plain dark grey for a name standing alone.
 */
export function labelColour(style: ZoneStyle | undefined): string {
  if (style?.frame) return style.frame;
  if (style?.fill) return shade(style.fill);
  return '#666';
}

/** A colour at a little over half its light — `#rgb` and `#rrggbb` only; anything else comes back as it was. */
export function shade(colour: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!m) return colour;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const part = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55);
  return `rgb(${part(0)}, ${part(2)}, ${part(4)})`;
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
