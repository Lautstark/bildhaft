import { describe, expect, it } from 'vitest';
import { printFor } from '../../src/app/print.ts';
import { DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import { rowsOf, withoutRow } from '../../src/core/talk.ts';
import { printableArea, talkGeometry } from '../../src/ui/printSheet.ts';

/**
 * A Plauderbuch: what its book says about its rows, and how its page is
 * measured. The pages on screen and on paper are in e2e/templates.spec.ts.
 */
describe('a Plauderbuch', () => {
  const book = {
    pages: [
      { id: 'a', question: 'q', sayings: ['x', 'y'] },
      { id: 'b', question: null, sayings: ['z'] },
    ],
  };

  it('names its rows page by page, the question before the Aussagen', () => {
    expect(rowsOf(book)).toEqual(['q', 'x', 'y', 'z']);
    expect(rowsOf(undefined)).toEqual([]);
  });

  it('lets go of a row wherever it stood', () => {
    expect(withoutRow(book, 'q').pages[0]!.question).toBeNull();
    expect(withoutRow(book, 'y').pages[0]!.sayings).toEqual(['x']);
    expect(rowsOf(withoutRow(book, 'z'))).toEqual(['q', 'x', 'y']);
  });

  it('opens on A5 across, its title printed, and keeps what it set for itself', () => {
    const opened = printFor({ ...DEFAULT_PRINT_SETTINGS, paper: 'a3', orientation: 'portrait', showCollectionTitle: true }, 'plauderbuch', null);
    expect(opened).toMatchObject({ layout: 'plauderbuch', paper: 'a5', orientation: 'landscape', showCollectionTitle: true });
    expect(printFor(DEFAULT_PRINT_SETTINGS, 'plauderbuch', null, { paper: 'a4', orientation: 'portrait' }))
      .toMatchObject({ paper: 'a4', orientation: 'portrait' });
  });

  it('lays out three fields across and two down lying, two and three standing', () => {
    const across = talkGeometry({ paper: 'a5', orientation: 'landscape' }, printableArea('a5', 'landscape'), 0);
    expect([across.cols, across.rows]).toEqual([3, 2]);
    const up = talkGeometry({ paper: 'a5', orientation: 'portrait' }, printableArea('a5', 'portrait'), 0);
    expect([up.cols, up.rows]).toEqual([2, 3]);
  });

  it('fits its fields and the band on the page, whatever the footer takes', () => {
    for (const paper of ['a5', 'a4', 'a3'] as const) {
      for (const orientation of ['landscape', 'portrait'] as const) {
        for (const reserve of [0, 25]) {
          const page = printableArea(paper, orientation);
          const g = talkGeometry({ paper, orientation }, page, reserve);
          const used = g.cardH + 2 * g.air + 8 * g.k + g.rows * g.cardH + (g.rows - 1) * g.gap;
          expect(used).toBeLessThanOrEqual(page.height - reserve + 1e-6);
          expect(g.cols * g.cardW + (g.cols - 1) * g.gap).toBeCloseTo(page.width, 6);
          expect(g.cardH).toBeLessThanOrEqual(g.cardW * 0.62 + 1e-6);
        }
      }
    }
  });

  it('grows with the paper: A4 by √2, A3 by 2, as long as the paper is not too short', () => {
    const a5 = talkGeometry({ paper: 'a5', orientation: 'portrait' }, printableArea('a5', 'portrait'), 0);
    const a3 = talkGeometry({ paper: 'a3', orientation: 'portrait' }, printableArea('a3', 'portrait'), 0);
    expect(a3.k / a5.k).toBe(2);
    expect(a3.cardW).toBeGreaterThan(2 * a5.cardW);
  });
});
