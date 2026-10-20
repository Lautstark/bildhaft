import type { Board, CollectionKind, PrintSettings } from '../core/types.ts';
import { boardOf, defaultAirMm } from '../core/board.ts';
import { printableArea } from '../ui/printSheet.ts';

/**
 * What the print dialog offers a material — which controls, never where.
 *
 * The dialog draws them in one order for every template: colour, paper, size,
 * margin, label, frames, then the checks. A template says which of them it
 * has and nothing about how they look, so the same control is in the same
 * place under the same name wherever it appears, and a new template is a new
 * entry here rather than a new set of conditions threaded through the dialog.
 *
 * Absent means not offered — not greyed out, not there: a control that cannot
 * mean anything for this material is not shown.
 */
export interface PrintOffer {
  /** The material's own colour: a Rezept's headings, a Lied's refrain ground. */
  colour?: boolean;
  paper?: boolean;
  /**
   * How big. `symbol` is one number, with its bounds and a note under it (or
   * the card readout when there is none); `cards` is the card sheet's choice
   * of symbol, card or grid; `board` is a Tafel's readout, its grid being the
   * Sammlung's own.
   */
  size?: { kind: 'symbol'; max: number; fallback: number; note: string | null } | { kind: 'cards' } | { kind: 'board' };
  /** The same millimetres: a cutting margin where scissors go, air where none do. */
  margin?: 'cut' | 'air';
  /** `full`: whether, where and how big; `size`: how big only, the words always printing. */
  label?: 'full' | 'size';
  frames?: boolean;
  /** A frame around a whole strip, as well as around each card. */
  stripFrame?: boolean;
  cutLines?: boolean;
  /** The line as written, over or under its pictures, and how big: a strip's, a Lied's. */
  sentence?: boolean;
  /** Satzstreifen as strips: one to a page. */
  onePerPage?: boolean;
  /** Lied: the headings over the parts, and „2×". */
  songChecks?: boolean;
  title?: boolean;
  /** „Seite 1 von 3" at the foot of each page. */
  pageNumbers?: boolean;
}

/**
 * A template: how it is typed into, and how it prints.
 *
 * Everything in the app that has to ask „which template is this?" asks here,
 * so that the answer for a new template is written once, in one place, and a
 * question nobody remembered to answer for it is a type error rather than a
 * Lied that cannot be printed on A5.
 */
export interface Template {
  /** Holds one-word cards: the wall of cards, the tray, the counter that says „Karten". */
  cards: boolean;
  /**
   * Print settings changed here stay with this Sammlung and do not become the
   * household's. True for a material whose numbers are about itself — a
   * Rezept's 20 mm cards handed to the household would be the next
   * Satzstreifen's symbol size.
   */
  ownPrint: boolean;
  /**
   * The settings the print dialog opens on: the household's, under what this
   * Sammlung set for itself (`print` holds both, merged), under what the
   * template insists on. `own` is this Sammlung's alone, for a template that
   * must not take the household's.
   */
  opens(print: PrintSettings, own: Partial<PrintSettings>, board: Board | null): PrintSettings;
  offers(settings: PrintSettings): PrintOffer;
}

const CARD_SHEET: PrintOffer = {
  paper: true, size: { kind: 'cards' }, margin: 'cut', label: 'full', frames: true, cutLines: true, title: true,
  pageNumbers: true,
};

export const TEMPLATES: Record<CollectionKind, Template> = {
  /* Prints as strips, and only as strips: the template is the choice. Cards
     to cut out are the Wortkarten's, so a remembered card sheet here — from
     when a Satzstreifen could be printed as one — opens as strips again. */
  satzstreifen: {
    cards: false, ownPrint: false,
    opens: (print) => (print.layout === 'strip' ? print : { ...print, layout: 'strip' }),
    offers: () => ({
      paper: true, size: { kind: 'symbol', max: 120, fallback: 40, note: null },
      margin: 'cut', label: 'full', frames: true, stripFrame: true, sentence: true, onePerPage: true, title: true, pageNumbers: true,
    }),
  },

  /* Opens on the card sheet, and only there: a strip of one symbol is a card
     with the wrong margins, so a remembered strip here is the other
     template's setting arriving in this one. */
  wortkarten: {
    cards: true, ownPrint: false,
    opens: (print) => (print.layout === 'sheet' ? print : { ...print, layout: 'sheet' }),
    offers: () => CARD_SHEET,
  },

  /* Prints as the grid it is. Its columns and rows are the Sammlung's, not
     the dialog's — the dialog's are for a deck being asked to *become* a grid.
     And the air around each card rather than the cutting margin, which on a
     Tafel is the same number under another name: what this Tafel set for
     itself when it has, otherwise from the size of a field on this paper, so
     a crowded A5 gets less than a roomy A4. */
  tafel: {
    cards: true, ownPrint: false,
    opens: (print, own, board) => {
      const grid = board ?? boardOf({});
      const page = printableArea(print.paper, print.orientation);
      const field = Math.min(page.width / grid.cols, page.height / grid.rows);
      const air = own.cutMarginMm ?? grid.airMm;
      return {
        ...print, layout: 'sheet', sheetFit: 'grid', gridCols: grid.cols, gridRows: grid.rows,
        cutMarginMm: air ?? defaultAirMm(field),
      };
    },
    offers: () => ({
      paper: true, size: { kind: 'board' }, margin: 'air', label: 'full', frames: true, title: true, pageNumbers: true,
    }),
  },

  /* Brings its own millimetres. Fifteen zones beside fifteen more on one
     sheet is only possible at 20 mm, measured rather than chosen — and a 3 mm
     laminating margin, because 5 mm around a 20 mm card is a third of the
     card. Facts about this material, not preferences. */
  einkaufsliste: {
    cards: true, ownPrint: false,
    opens: (print) => ({
      ...print, layout: 'einkaufsliste', paper: 'a4', orientation: 'landscape',
      symbolSizeMm: 20, cutMarginMm: 3, showLabel: true, showCollectionTitle: true,
      titleSizePt: 12, titleColour: null, titleLine: false,
    }),
    offers: () => ({ frames: true, cutLines: true }),
  },

  /* Opens on one A4 page standing up, its name at the top, cards small
     enough that the Zutaten, the Hilfsmittel and the first Schritte share it.
     The paper is a choice, as a Lied's is — a recipe goes on the fridge in
     A4 and into a folder in A5 — and so is the size, because a child who
     needs bigger pictures gets a second page rather than smaller ones. */
  rezept: {
    cards: false, ownPrint: true,
    opens: (print, own) => ({
      ...print, layout: 'rezept', paper: own.paper ?? 'a4', orientation: own.orientation ?? 'portrait',
      symbolSizeMm: own.symbolSizeMm ?? 20, cutMarginMm: 1.5,
      showLabel: true, labelPosition: 'below', labelSizePt: own.labelSizePt ?? 9,
      cardBorderMm: 0, cardBackground: null,
      showCollectionTitle: own.showCollectionTitle ?? true,
      titleSizePt: own.titleSizePt ?? 15,
      titleColour: own.titleColour !== undefined ? own.titleColour : null,
      titleLine: own.titleLine ?? true,
      showPageNumbers: own.showPageNumbers ?? false,
    }),
    offers: () => ({
      colour: true, paper: true, size: { kind: 'symbol', max: 60, fallback: 20, note: null }, label: 'size',
      title: true, pageNumbers: true,
    }),
  },

  /* Opens on A4 standing up, written out as it is sung, pictures small enough
     that a Strophe's longest line fits across, the Refrain on a ground of its
     own colour — blue until it is given another. No line of text over the
     pictures unless asked for: the person singing knows the words, and the
     sheet is for whoever reads the pictures. Offered what a Satzstreifen
     is, because a song sheet goes into an A5 folder as often as onto the
     wall. What it set for itself wins, and the household's does not reach
     it, or a 40 mm strip's frame would be the next song's. */
  lied: {
    cards: false, ownPrint: true,
    opens: (print, own) => ({
      ...print, layout: 'lied',
      paper: own.paper ?? 'a4',
      orientation: own.orientation ?? 'portrait',
      symbolSizeMm: own.symbolSizeMm ?? 16,
      cutMarginMm: 1,
      showLabel: own.showLabel ?? true,
      labelPosition: own.labelPosition ?? 'below',
      labelSizePt: own.labelSizePt ?? 9,
      cardBorderMm: own.cardBorderMm ?? 0,
      cardRadiusMm: own.cardRadiusMm ?? print.cardRadiusMm,
      cardBorderColor: own.cardBorderColor ?? print.cardBorderColor,
      cardBackground: own.cardBackground !== undefined ? own.cardBackground : null,
      showCollectionTitle: own.showCollectionTitle ?? true,
      titleSizePt: own.titleSizePt ?? 15,
      titleColour: own.titleColour !== undefined ? own.titleColour : null,
      titleLine: own.titleLine ?? true,
      showSentenceText: own.showSentenceText ?? false,
      sentencePosition: own.sentencePosition ?? 'above',
      sentenceSizePt: own.sentenceSizePt ?? 10,
      showPageNumbers: own.showPageNumbers ?? false,
      songRefrainOnce: own.songRefrainOnce ?? false,
      accentColour: own.accentColour ?? '#2c66c8',
    }),
    offers: () => ({
      colour: true, paper: true, size: { kind: 'symbol', max: 60, fallback: 16, note: null },
      label: 'full', frames: true, sentence: true, songChecks: true, title: true, pageNumbers: true,
    }),
  },
};
