import { describe, expect, it } from 'vitest';
import { DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import { bleeds, gameFits, pageMargins, printableArea, PUNCH_MARGIN_MM } from '../../src/ui/printSheet.ts';

/**
 * A sheet punched for a ring binder keeps its punched edge 2 cm free, and
 * everything on the page is measured on what is left — the same as any other
 * margin, so a Spiel offers fewer cells or rows instead of running into the
 * holes.
 */
describe('a punched sheet', () => {
  it('widens only the punched edge', () => {
    expect(pageMargins(null)).toEqual({ top: 10, right: 10, bottom: 6, left: 10 });
    expect(pageMargins('left').left).toBe(PUNCH_MARGIN_MM);
    expect(pageMargins('top').top).toBe(PUNCH_MARGIN_MM);
    expect(printableArea('a4', 'portrait', 'left')).toEqual({ width: 180, height: 281 });
    expect(printableArea('a4', 'landscape', 'top')).toEqual({ width: 277, height: 194 - 10 });
  });

  it('carries its margin on the page box, so the marks can stand in it', () => {
    expect(bleeds({ pageColour: null, punch: null })).toBe(false);
    expect(bleeds({ pageColour: null, punch: 'top' })).toBe(true);
  });

  it('is off until asked for', () => {
    expect(DEFAULT_PRINT_SETTINGS.punch).toBeNull();
  });

  it('costs a Spiel a row when punched at the top, a cell when punched at the left', () => {
    const settings = { paper: 'a4' as const, cutMarginMm: 3, showLabel: false, labelSizePt: 10 };
    // Measured as the sheet measures it: page, then the title's and credits' room.
    const reserve = 23;
    const five = { units: 5, zellen: 2, platz: 5 };
    const wide = { units: 5, zellen: 6, platz: 5 };
    expect(gameFits(settings, printableArea('a4', 'landscape'), reserve, five)).toBe(true);
    expect(gameFits(settings, printableArea('a4', 'landscape'), reserve, wide)).toBe(true);
    // Oben: four rows stand under each other, so five pairs take two columns — and still fit.
    expect(gameFits(settings, printableArea('a4', 'landscape', 'top'), reserve, five)).toBe(true);
    // Links: a row of six no longer fits beside the Ablage.
    expect(gameFits(settings, printableArea('a4', 'landscape', 'left'), reserve, wide)).toBe(false);
    expect(gameFits(settings, printableArea('a4', 'landscape', 'left'), reserve, { ...wide, zellen: 5 })).toBe(true);
  });
});
