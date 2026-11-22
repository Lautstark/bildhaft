import { describe, expect, it } from 'vitest';
import { storyMiddle, storyRows } from '../../src/core/types.ts';

/**
 * How many photos an Erzählen sheet's middle takes on its paper, and the
 * rows they lie in (her call, 2026-11-22).
 */
describe('the middle of an Erzählen sheet', () => {
  it('holds four on A5, eight on A4 lying, nine on A4 standing', () => {
    expect(storyMiddle('a5', 'landscape')).toEqual({ max: 4, cols: 4 });
    expect(storyMiddle('a5', 'portrait')).toEqual({ max: 4, cols: 2 });
    expect(storyMiddle('a4', 'landscape')).toEqual({ max: 8, cols: 4 });
    expect(storyMiddle('a4', 'portrait')).toEqual({ max: 9, cols: 3 });
  });

  it('lays them in as few rows as hold them, as even as they go', () => {
    expect(storyRows(4, 4)).toEqual({ cols: 4, rows: 1 });
    expect(storyRows(8, 4)).toEqual({ cols: 4, rows: 2 });
    expect(storyRows(5, 4)).toEqual({ cols: 3, rows: 2 });
    expect(storyRows(9, 3)).toEqual({ cols: 3, rows: 3 });
    expect(storyRows(8, 3)).toEqual({ cols: 3, rows: 3 });
    expect(storyRows(4, 3)).toEqual({ cols: 2, rows: 2 });
    expect(storyRows(2, 3)).toEqual({ cols: 2, rows: 1 });
    expect(storyRows(0, 3)).toEqual({ cols: 1, rows: 1 });
  });
});
