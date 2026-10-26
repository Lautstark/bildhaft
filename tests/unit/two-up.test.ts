import { describe, expect, it } from 'vitest';
import type { Slot } from '../../src/core/types.ts';
import { cutArea, printableArea, printerPaper, sheetsOf, type Block } from '../../src/ui/printSheet.ts';

/**
 * The printer takes A4 and nothing else. An A5 material is laid out on A5
 * and goes two pages to a sheet, in order, to be folded and cut apart; its
 * cards to cut out go on whole sheets of A4.
 */
describe('two A5 pages on one A4', () => {
  it('turns the sheet: A5 lying twice down an A4 standing, A5 standing twice across an A4 lying', () => {
    expect(printerPaper({ paper: 'a5', orientation: 'landscape' })).toEqual({ paper: 'a4', orientation: 'portrait' });
    expect(printerPaper({ paper: 'a5', orientation: 'portrait' })).toEqual({ paper: 'a4', orientation: 'landscape' });
    expect(printerPaper({ paper: 'a4', orientation: 'landscape' })).toEqual({ paper: 'a4', orientation: 'landscape' });
  });

  it('lays cards to cut out on the whole A4', () => {
    expect(cutArea({ paper: 'a5', orientation: 'landscape', punch: null })).toEqual(printableArea('a4', 'portrait'));
    expect(cutArea({ paper: 'a4', orientation: 'landscape', punch: 'left' })).toEqual(printableArea('a4', 'landscape', 'left'));
  });

  const page: Block[] = [{ kind: 'song-again' }];
  const cards: Block[] = [{ kind: 'cut', slots: [] as Slot[], last: true }];

  it('puts the pages two to a sheet in order, and a page of cards on a sheet of its own', () => {
    expect(sheetsOf([page, page, page, cards, cards], { paper: 'a5' })).toEqual([
      { pages: [0, 1], whole: false },
      { pages: [2], whole: false },
      { pages: [3], whole: true },
      { pages: [4], whole: true },
    ]);
    expect(sheetsOf([page, page, page, page], { paper: 'a5' }).map((sheet) => sheet.pages)).toEqual([[0, 1], [2, 3]]);
  });

  it('leaves A4 one page to a sheet', () => {
    expect(sheetsOf([page, page, cards], { paper: 'a4' }).map((sheet) => sheet.pages)).toEqual([[0], [1], [2]]);
  });
});
