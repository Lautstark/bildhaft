import { describe, expect, it } from 'vitest';
import { printFor } from '../../src/app/print.ts';
import { DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import { rowsOf, withoutRow, withSwapped } from '../../src/core/talk.ts';
import { printableArea, talkCapacity, talkGeometry } from '../../src/ui/printSheet.ts';

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
    const opened = printFor({ ...DEFAULT_PRINT_SETTINGS, paper: 'a4', orientation: 'portrait', showCollectionTitle: true }, 'plauderbuch', null);
    expect(opened).toMatchObject({ layout: 'plauderbuch', paper: 'a5', orientation: 'landscape', showCollectionTitle: true });
    expect(printFor(DEFAULT_PRINT_SETTINGS, 'plauderbuch', null, { paper: 'a4', orientation: 'portrait' }))
      .toMatchObject({ paper: 'a4', orientation: 'portrait' });
  });

  const settings = { showLabel: false, labelSizePt: 9, cutMarginMm: 3 };

  it('changes two Aussagen of a page, and nothing else', () => {
    expect(withSwapped(book, 'a', 'x', 'y').pages[0]!.sayings).toEqual(['y', 'x']);
    expect(withSwapped(book, 'a', 'x', 'z')).toEqual(book);
  });

  it('holds three fields on A5 lying, six standing, eight and nine on A4 — with the word or without', () => {
    for (const showLabel of [false, true]) {
      expect(talkCapacity({ paper: 'a5', orientation: 'landscape', showLabel })).toBe(3);
      expect(talkCapacity({ paper: 'a5', orientation: 'portrait', showLabel })).toBe(6);
      expect(talkCapacity({ paper: 'a4', orientation: 'landscape', showLabel })).toBe(8);
      expect(talkCapacity({ paper: 'a4', orientation: 'portrait', showLabel })).toBe(9);
    }
    const square = talkGeometry({ ...settings, paper: 'a5', orientation: 'landscape' }, printableArea('a5', 'landscape'), 0);
    expect(square.cardW).toBeCloseTo(square.cardH, 6);
    const upright = talkGeometry({ ...settings, showLabel: true, paper: 'a5', orientation: 'landscape' }, printableArea('a5', 'landscape'), 0);
    expect(upright.cardW / upright.cardH).toBeCloseTo(0.75, 6);
  });

  it('fits its fields and the band on the page, whatever the footer takes', () => {
    for (const paper of ['a5', 'a4'] as const) {
      for (const orientation of ['landscape', 'portrait'] as const) {
        for (const showLabel of [false, true]) {
          for (const reserve of [0, 25]) {
            const page = printableArea(paper, orientation);
            const g = talkGeometry({ ...settings, showLabel, paper, orientation }, page, reserve);
            const used = (g.rows + 1) * g.cardH + 6 * g.k + g.rows * g.gap;
            expect(used).toBeLessThanOrEqual(page.height - reserve + 1e-6);
            expect(g.cols * g.cardW + (g.cols - 1) * g.gap).toBeLessThanOrEqual(page.width + 1e-6);
          }
        }
      }
    }
  });

  it('cuts its cards the laminate seam smaller than a field, two millimetres a side', () => {
    const g = talkGeometry({ ...settings, paper: 'a4', orientation: 'landscape' }, printableArea('a4', 'landscape'), 0);
    expect(g.cardW - g.cutW).toBeCloseTo(4, 6);
    expect(g.cardH - g.cutH).toBeCloseTo(4, 6);
    expect(g.symW).toBeLessThanOrEqual(g.cutW);
  });

  it('scales its band and gaps with the paper: A4 by √2', () => {
    const a5 = talkGeometry({ ...settings, paper: 'a5', orientation: 'portrait' }, printableArea('a5', 'portrait'), 0);
    const a4 = talkGeometry({ ...settings, paper: 'a4', orientation: 'portrait' }, printableArea('a4', 'portrait'), 0);
    expect(a4.k / a5.k).toBe(Math.SQRT2);
    expect(a4.gap / a5.gap).toBeCloseTo(Math.SQRT2, 6);
  });
});
