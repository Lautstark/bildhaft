import { describe, expect, it } from 'vitest';
import { ownPrint, printFor } from '../../src/app/print.ts';
import { TEMPLATES } from '../../src/app/templates.ts';
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
    expect(printFor(remembered, 'satzstreifen', null)).toEqual(remembered);
  });

  it('opens Wortkarten on the card sheet, and only moves that', () => {
    expect(printFor(remembered, 'wortkarten', null)).toEqual({ ...remembered, layout: 'sheet' });
    const sheet = { ...remembered, layout: 'sheet' as const };
    expect(printFor(sheet, 'wortkarten', null)).toEqual(sheet);
  });

  describe('a Tafel', () => {
    const board = boardOf({ board: { ...boardOf({}), cols: 5, rows: 3 } });

    it('prints as its own grid, with air around each card from the paper', () => {
      /* Eine Tafel hängt quer: ihr Luft-Standard rechnet auf dem A4-Querfeld,
         was immer gerade gemerkt ist. */
      const page = printableArea('a4', 'landscape');
      const field = Math.min(page.width / 5, page.height / 3);
      expect(printFor(remembered, 'tafel', board)).toMatchObject({
        layout: 'sheet', sheetFit: 'grid', gridCols: 5, gridRows: 3,
        orientation: 'landscape',
        cutMarginMm: defaultAirMm(field),
      });
    });

    it('keeps the air the Tafel set for itself, over what the board carries', () => {
      const own = boardOf({ board: { ...board, airMm: 3 } });
      expect(printFor(remembered, 'tafel', own).cutMarginMm).toBe(3);
      expect(printFor(remembered, 'tafel', own, { cutMarginMm: 6 }).cutMarginMm).toBe(6);
    });

    it('dashes its free fields only when this Tafel asked, not when the last one did', () => {
      expect(printFor({ ...remembered, markFreeFields: true }, 'tafel', board).markFreeFields).toBe(false);
      expect(printFor(remembered, 'tafel', board, { markFreeFields: true }).markFreeFields).toBe(true);
    });
  });

  it('gives an Einkaufsliste its own millimetres, whatever was remembered', () => {
    expect(printFor(remembered, 'einkaufsliste', null)).toMatchObject({
      layout: 'einkaufsliste', paper: 'a4', orientation: 'landscape',
      symbolSizeMm: 20, cutMarginMm: 3, showLabel: true, showCollectionTitle: true,
      cardBorderMm: 0, cardBackground: null, showCutLines: true,
    });
  });

  it('grows and shrinks an Einkaufsliste with the paper it set for itself, lying on its side', () => {
    expect(printFor(remembered, 'einkaufsliste', null, { paper: 'a3', orientation: 'portrait' })).toMatchObject({
      paper: 'a3', orientation: 'landscape', symbolSizeMm: 28, cutMarginMm: 4,
    });
    expect(printFor(remembered, 'einkaufsliste', null, { paper: 'a5' })).toMatchObject({
      paper: 'a5', orientation: 'landscape', symbolSizeMm: 14, cutMarginMm: 2,
    });
  });

  describe('a Rezept', () => {
    it('opens on one A4 page standing up, headed by its name', () => {
      expect(printFor({ ...remembered, orientation: 'landscape', paper: 'a3' }, 'rezept', null))
        .toMatchObject({
          layout: 'rezept', paper: 'a4', orientation: 'portrait',
          symbolSizeMm: 20, showLabel: true, showCollectionTitle: true,
        });
    });

    it('keeps the card size it set for itself, not the household one', () => {
      expect(printFor({ ...remembered, symbolSizeMm: 40 }, 'rezept', null).symbolSizeMm).toBe(20);
      expect(printFor(remembered, 'rezept', null, { symbolSizeMm: 32 }).symbolSizeMm).toBe(32);
    });
  });

  describe('a Lied', () => {
    it('opens on A4 standing up, written out, with headings and in blue', () => {
      expect(printFor({ ...remembered, orientation: 'landscape', paper: 'a3' }, 'lied', null))
        .toMatchObject({
          layout: 'lied', paper: 'a4', orientation: 'portrait', symbolSizeMm: 16,
          showCollectionTitle: true, songHeadings: true, songRepeats: false, accentColour: '#2c66c8',
        });
    });

    it('takes the paper it set for itself, and not the household one', () => {
      expect(printFor({ ...remembered, paper: 'a3' }, 'lied', null).paper).toBe('a4');
      expect(printFor(remembered, 'lied', null, { paper: 'a5', orientation: 'landscape' }))
        .toMatchObject({ paper: 'a5', orientation: 'landscape' });
      expect(printFor({ ...remembered, cardBorderMm: 1 }, 'lied', null).cardBorderMm).toBe(0);
      expect(printFor(remembered, 'lied', null, { cardBorderMm: 0.5 }).cardBorderMm).toBe(0.5);
    });

    it('keeps what it set for itself', () => {
      expect(printFor(remembered, 'lied', null, { symbolSizeMm: 22, accentColour: '#2e8b57' }))
        .toMatchObject({ symbolSizeMm: 22, accentColour: '#2e8b57' });
    });
  });

  /* The household remembers the layout printed last. Printed last as a
     material, that layout is not one a sentence or a card can take. */
  it('never opens a Satzstreifen or Wortkarten on a material', () => {
    for (const layout of ['einkaufsliste', 'rezept', 'lied', 'plauderbuch'] as const) {
      expect(printFor({ ...remembered, layout }, 'satzstreifen', null).layout).toBe('strip');
      expect(printFor({ ...remembered, layout }, 'wortkarten', null).layout).toBe('sheet');
    }
  });
});

/**
 * What a Sammlung keeps of its print: only where it differs from its
 * template, so another template given to it starts on its own defaults.
 */
describe('what a Sammlung keeps of its print', () => {
  it('keeps what differs from its template, and nothing else', () => {
    const print = { ...printFor(DEFAULT_PRINT_SETTINGS, 'satzstreifen', null), symbolSizeMm: 55, showCopyright: true };
    expect(ownPrint('satzstreifen', print, null)).toEqual({ symbolSizeMm: 55 });
  });

  it('keeps nothing of a print that is its template\'s own', () => {
    expect(ownPrint('rezept', printFor(DEFAULT_PRINT_SETTINGS, 'rezept', null), null)).toEqual({});
  });

  it('lets a Sammlung given another template open on that one\'s defaults', () => {
    const own = ownPrint('satzstreifen', { ...printFor(DEFAULT_PRINT_SETTINGS, 'satzstreifen', null), cutMarginMm: 5 }, null);
    expect(printFor(DEFAULT_PRINT_SETTINGS, 'rezept', null, own)).toMatchObject({
      layout: 'rezept', showCollectionTitle: true, paper: 'a4', orientation: 'portrait',
    });
  });
});

/**
 * One base for every template, left out only where the paper decides: an
 * Einkaufsliste lies on its side with its millimetres from its paper.
 */
describe('what the print view offers', () => {
  it('offers every template but the Einkaufsliste the same base', () => {
    for (const which of ['satzstreifen', 'wortkarten', 'tafel', 'rezept', 'lied', 'spiel', 'plauderbuch'] as const) {
      expect(TEMPLATES[which].offers(DEFAULT_PRINT_SETTINGS), which).toMatchObject({
        paper: true, label: true, frames: true, background: true, page: true, pageNumbers: true,
      });
      expect(TEMPLATES[which].offers(DEFAULT_PRINT_SETTINGS).margin, which).toBeTruthy();
      expect(TEMPLATES[which].offers(DEFAULT_PRINT_SETTINGS).title, which).toBeTruthy();
    }
  });
});
