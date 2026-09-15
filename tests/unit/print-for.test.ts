import { describe, expect, it } from 'vitest';
import { printFor } from '../../src/app/print.ts';
import { DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import { boardOf, defaultAirMm } from '../../src/core/board.ts';
import { printableArea } from '../../src/ui/printSheet.ts';

/**
 * The layout a template opens the print dialog on.
 *
 * Held here rather than in e2e/print.spec.ts because each rule is a sentence
 * about one template and one setting, and a browser adds nothing to it. The
 * comment on printFor() has the reasoning; this is the list.
 */
describe('what a template opens the print dialog on', () => {
  const remembered = { ...DEFAULT_PRINT_SETTINGS, layout: 'strip' as const, cutMarginMm: 2 };

  it('leaves a Satzstreifen-Sammlung on whatever was chosen', () => {
    expect(printFor(remembered, 'satzstreifen', null)).toBe(remembered);
  });

  it('opens Wortkarten on the card sheet, and only moves that', () => {
    expect(printFor(remembered, 'wortkarten', null)).toEqual({ ...remembered, layout: 'sheet' });
    const sheet = { ...remembered, layout: 'sheet' as const };
    expect(printFor(sheet, 'wortkarten', null)).toBe(sheet);
  });

  describe('a Tafel', () => {
    const board = boardOf({ board: { ...boardOf({}), cols: 5, rows: 3 } });

    it('prints as its own grid, with air around each card from the paper', () => {
      const page = printableArea(remembered.paper, remembered.orientation);
      const field = Math.min(page.width / 5, page.height / 3);
      expect(printFor(remembered, 'tafel', board)).toMatchObject({
        layout: 'sheet', sheetFit: 'grid', gridCols: 5, gridRows: 3,
        cutMarginMm: defaultAirMm(field),
      });
    });

    it('keeps the air the Tafel set for itself, over what the board carries', () => {
      const own = boardOf({ board: { ...board, airMm: 3 } });
      expect(printFor(remembered, 'tafel', own).cutMarginMm).toBe(3);
      expect(printFor(remembered, 'tafel', own, 6).cutMarginMm).toBe(6);
    });
  });

  it('gives an Einkaufsliste its own millimetres, whatever was remembered', () => {
    expect(printFor(remembered, 'einkaufsliste', null)).toMatchObject({
      layout: 'einkaufsliste', paper: 'a4', orientation: 'landscape',
      symbolSizeMm: 20, cutMarginMm: 3, showLabel: true, showCollectionTitle: true,
    });
  });
});
