import { describe, expect, it } from 'vitest';
import {
  blockAt, boardOf, defaultAirMm, dissolveZone, firstFree, labelColour, labelField, newZoneId, placedIds, placeOn,
  resizeBoard, setZone, shade, stylesOf, takeOff, zoneBorder, zoneBox, zoneClip, zoneCorners, zoneCrooks, zoneJoint, zoneMap, zonesOf,
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
    expect(boardOf({})).toEqual({ ...grid(4, 3), zones: Array(12).fill(null), styles: {} });
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
 * A colour behind fields. It belongs to the field, not the card: the block
 * says „the colours go here" and stays when a card moves. What is held is
 * that painting never touches a card, that a smaller grid keeps the colours
 * of the fields it keeps, that the block a field belongs to is what touches
 * it in its colour, and that the rectangles of one September day are read
 * back as the fields they covered.
 */
const y = '#fff1b8';
const b = '#d6e9fb';

/** Fields into a group with a fill, the way one September build wrote it: the colour as the key. */
const paint = (board: Board, indices: number[], colour: string) => setZone(board, indices, colour, { fill: colour });

describe('a group on fields', () => {
  it('takes the fields into the group and leaves the cards alone', () => {
    const board = placeOn(grid(2, 2), 'a', 1);
    const next = setZone(board, [1, 3], 'g1', { fill: y, name: ' Farben ' });
    expect(next.zones).toEqual([null, 'g1', null, 'g1']);
    expect(next.styles).toEqual({ g1: { fill: y, name: 'Farben' } });
    expect(next.cells).toEqual(board.cells);
    // The same again is nothing; a field outside the grid is nothing.
    expect(setZone(next, [1], 'g1', { fill: y, name: 'Farben' })).toBe(next);
    expect(setZone(next, [99], 'g1', { fill: y, name: 'Farben' })).toBe(next);
  });

  it('is gone when its style draws nothing, or when it is dissolved', () => {
    const next = setZone(grid(2, 2), [1, 3], 'g1', { frame: b });
    expect(setZone(next, [1, 3], 'g1', {}).zones).toEqual([null, null, null, null]);
    expect(setZone(next, [1, 3], 'g1', { name: '  ' }).styles).toEqual({});
    expect(dissolveZone(next, 'g1').zones).toEqual([null, null, null, null]);
    expect(dissolveZone(next, 'g1').styles).toEqual({});
    expect(dissolveZone(next, 'g9')).toBe(next);
  });

  it('lets a field leave one group for another, and forgets a group nobody is in', () => {
    const two = setZone(setZone(grid(3, 1), [0, 1], 'g1', { fill: y }), [1, 2], 'g2', { frame: b });
    expect(two.zones).toEqual(['g1', 'g2', 'g2']);
    const gone = setZone(two, [0], 'g2', { frame: b });
    expect(gone.zones).toEqual(['g2', 'g2', 'g2']);
    expect(gone.styles).toEqual({ g2: { frame: b } });
  });

  it('names a group no other has', () => {
    expect(newZoneId(grid(2, 1))).toBe('g1');
    expect(newZoneId(setZone(grid(2, 1), [0], 'g1', { fill: y }))).toBe('g2');
    expect(newZoneId({ zones: ['g1', 'g3'], styles: { g2: {} } })).toBe('g4');
  });

  it('keeps its groups through a resize, like the cards', () => {
    const painted = setZone(grid(3, 2), [0, 2], 'g1', { fill: y });
    const smaller = resizeBoard(painted, 2, 2);
    expect(smaller.zones).toEqual(['g1', null, null, null]);
    expect(smaller.styles).toEqual({ g1: { fill: y } });
    // A group whose every field fell off the edge is forgotten with them.
    expect(resizeBoard(setZone(grid(3, 1), [2], 'g1', { fill: y }), 2, 1).styles).toEqual({});
  });

  it('knows the block a field belongs to', () => {
    // y y .      a block is what touches over a side, not a corner
    // . y b
    const m = zoneMap(paint(paint(grid(3, 2), [0, 1, 4], y), [5], b));
    expect(blockAt(m, 4)).toEqual([0, 1, 4]);
    expect(blockAt(m, 5)).toEqual([5]);
    expect(blockAt(m, 2)).toEqual([]);
  });

  it('reads the rectangles of the older form as groups with that colour behind them', () => {
    const groups = [{ col: 0, row: 0, cols: 3, rows: 1, colour: y }, { col: 2, row: 1, cols: 1, rows: 1, colour: y }];
    const read = boardOf({ board: { cols: 3, rows: 2, cells: [], groups } });
    expect(read.zones).toEqual([y, y, y, null, null, y]);
    expect(read.styles).toEqual({ [y]: { fill: y } });
    expect(zonesOf({ cols: 2, rows: 1, groups: [{ col: 1, row: 0, cols: 5, rows: 5, colour: b }] })).toEqual([null, b]);
    // And writes back fields, never rectangles.
    expect(setZone(read, [3], 'g1', { fill: b })).not.toHaveProperty('groups');
  });

  it('reads a colour per field, the form between, as a group with that fill', () => {
    const read = boardOf({ board: { cols: 2, rows: 1, cells: [], zones: [y, null] } });
    expect(stylesOf(read)).toEqual({ [y]: { fill: y } });
    // A key that is neither a colour nor styled is a group that draws nothing.
    expect(stylesOf({ cols: 1, rows: 1, zones: ['g7'] })).toEqual({ g7: {} });
  });

  it('writes its name on its first field, in its frame\'s colour or a darker fill', () => {
    const m = zoneMap(setZone(grid(2, 2), [1, 2, 3], 'g1', { fill: '#fff1b3', name: 'Farben' }));
    expect(labelField(m, 'g1')).toBe(1);
    expect(labelField(m, 'g2')).toBe(-1);
    expect(labelColour({ frame: '#f0b323', fill: '#fff1b3' })).toBe('#f0b323');
    expect(labelColour({ fill: '#fff1b3' })).toBe(shade('#fff1b3'));
    expect(labelColour({ name: 'allein' })).toBe('#666');
    expect(shade('#ffffff')).toBe('rgb(140, 140, 140)');
    expect(shade('#fff')).toBe('rgb(140, 140, 140)');
    expect(shade('tomato')).toBe('tomato');
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
  const map = (cols: number, rows: number, zones: (string | null)[]) => ({ cols, rows, zones, styles: {} });

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
    expect(zoneBox(m, 0, '1mm', '3mm')).toEqual({ inset: '1mm 0 1mm 1mm', borderRadius: '3mm 0 0 3mm', clipPath: null, crooks: [] });
    expect(zoneBox(m, 1, '1mm', '3mm')).toEqual({ inset: '1mm 1mm 1mm 0', borderRadius: '0 3mm 3mm 0', clipPath: null, crooks: [] });
    expect(zoneBox(m, 2, '1mm', '3mm')).toBeNull();
    expect(zoneBox(m, 0, '1mm', '3mm', '-0.3mm')!.inset).toBe('1mm -0.3mm 1mm 1mm');
    expect(zoneMap(paint(grid(2, 1), [0, 1], y)).zones).toEqual([y, y]);
  });

  it('turns an inner corner at the field across it: cut back there, and the frame carried round', () => {
    // . y      an L: the block turns at the bottom-right field, whose
    // y y      top-left corner is the crook
    const m = map(2, 2, [null, y, y, y]);
    expect(zoneCrooks(m, 3)).toEqual(['tl']);
    expect(zoneCrooks(m, 1)).toEqual([]);
    expect(zoneCrooks(m, 0)).toEqual([]);
    expect(zoneBox(m, 3, '4px', '12px', '-2px')!.clipPath)
      .toBe('polygon(calc(4px - (-2px)) 0, 100% 0, 100% 100%, 0 100%, 0 calc(4px - (-2px)), calc(4px - (-2px)) calc(4px - (-2px)))');
    expect(zoneBox(m, 1, '4px', '12px', '-2px')!.clipPath).toBeNull();
    // A U, open at the top: the block turns at both ends of the bottom row, not in its middle.
    const u = map(3, 2, [y, null, y, y, y, y]);
    expect(zoneCrooks(u, 3)).toEqual(['tr']);
    expect(zoneCrooks(u, 5)).toEqual(['tl']);
    expect(zoneCrooks(u, 4)).toEqual([]);
    expect(zoneClip(['tl', 'tr'], 'K')).toBe('polygon(K 0, calc(100% - K) 0, calc(100% - K) K, 100% K, 100% 100%, 0 100%, 0 K, K K)');
    // The joint sits in the corner, reaching out by the overlap, its strips where the neighbours' frames arrive.
    expect(zoneJoint('tl', '4px', '-2px', '2px')).toEqual({
      position: { top: '-2px', left: '-2px' }, size: 'calc(calc(4px - (-2px)) + 2px)', x: 'calc(4px - (-2px))', y: 'calc(4px - (-2px))',
    });
    expect(zoneJoint('br', '4px', '-2px', '2px').position).toEqual({ bottom: '-2px', right: '-2px' });
    expect(zoneJoint('br', '4px', '-2px', '2px')).toMatchObject({ x: '0', y: '0' });
    expect(zoneJoint('tr', '4px', '-2px', '2px')).toMatchObject({ x: '0', y: 'calc(4px - (-2px))' });
  });

  it('runs its frame along its own sides only', () => {
    const m = map(3, 1, [y, y, null]);
    expect(zoneBorder(m, 0, '2px')).toBe('2px 0 2px 2px');
    expect(zoneBorder(m, 1, '2px')).toBe('2px 2px 2px 0');
    expect(zoneBorder(m, 2, '2px')).toBeNull();
  });
});
