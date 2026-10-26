import { describe, expect, it } from 'vitest';
import { DEFAULT_PRINT_SETTINGS } from '../../src/core/types.ts';
import {
  bleeds, creditLines, gameFits, gameGeometry, gameReserveMm, METACOM_COPYRIGHT, pageMargins, printableArea, PUNCH_MARGIN_MM,
} from '../../src/ui/printSheet.ts';

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

  it('keeps a Spiel at its rows and cells when punched, the fence closer at the left', () => {
    const settings = { paper: 'a4' as const, cutMarginMm: 3, showLabel: false, labelSizePt: 10, punch: null };
    const reserve = 23;
    const wide = { units: 5, zellen: 6, platz: 5 };
    expect(gameFits(settings, printableArea('a4', 'landscape'), reserve, wide)).toBe(true);
    // Links: the page is a centimetre narrower, and only the closer fence keeps a row of six.
    expect(gameFits({ ...settings, punch: 'left' as const }, printableArea('a4', 'landscape', 'left'), reserve, wide)).toBe(true);
    expect(gameFits(settings, printableArea('a4', 'landscape', 'left'), reserve, wide)).toBe(false);
  });
});

describe('a Spiel of five rows and seven columns', () => {
  /* Five rows of 30 mm under each other, the Ablage and six cells across:
     the biggest a Spiel gets on A4 across. It prints at the one field size
     whatever else is on the sheet — the title, the METACOM line, page
     numbers, a punched edge at the top or the left. */
  const full = { units: 5, zellen: 6, platz: 5 };
  for (const paper of ['a5', 'a4', 'a3'] as const) for (const punch of [null, 'top', 'left'] as const) {
    for (const copyright of [false, true]) {
      for (const showPageNumbers of [false, true]) {
        it(`fits at its field on ${paper} — Lochen ${punch ?? 'aus'}, Copyright ${copyright ? 'an' : 'aus'}, Seitenzahlen ${showPageNumbers ? 'an' : 'aus'}`, () => {
          const settings = {
            ...DEFAULT_PRINT_SETTINGS, paper, orientation: 'landscape' as const,
            showCollectionTitle: true, titleSizePt: 15, titleLine: true, showLabel: false, punch, showPageNumbers,
          };
          const credits = creditLines(null, copyright ? METACOM_COPYRIGHT : null);
          const page = printableArea(paper, 'landscape', punch);
          const reserve = gameReserveMm(settings, credits, 'text');
          expect(gameFits(settings, page, reserve, full)).toBe(true);
          expect(gameGeometry(settings, page, reserve, full).units).toBe(5);
        });
      }
    }
  }
});
