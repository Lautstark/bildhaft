import type { Board, CollectionKind, PrintSettings } from '../core/types.ts';
import { boardOf, defaultAirMm } from '../core/board.ts';
import { printableArea, SHOPPING_SCALE } from '../ui/printSheet.ts';

/**
 * What the print dialog offers a material — which controls, never where.
 *
 * Every template has the same base (`BASE`) — the paper, the margin, the
 * title, the label, frames, a background on the cards and a colour behind the
 * page, page numbers — and the print view draws it in one order for all of
 * them: Papier, Größe, Gestaltung, then a group named after the template for
 * what only it has, and the Fußzeile last. A template says what it has and nothing
 * about how it looks, so the same control is in the same place under the same
 * name wherever it appears.
 *
 * Absent means not offered — not greyed out, not there. Left out only where
 * the paper decides: an Einkaufsliste lies on its side and takes its
 * millimetres from its paper, a Plauderbuch is a book of fields.
 */
export interface PrintOffer {
  /** The material's own colour: a Rezept's headings, a Lied's refrain ground. Its own group. */
  colour?: boolean;
  /** `true`: size and which way up; `size`: the size only, for a material that lies one way. */
  paper?: boolean | 'size';
  /**
   * How big. `symbol` is one number, with its bounds and a note under it (or
   * the card readout when there is none); `cards` is the card sheet's choice
   * of symbol, card or grid; `board` is a Tafel's readout, its grid being the
   * Sammlung's own. `cut: false` drops the card readout: a Rezept and a Lied
   * are not cut apart, so „Kartengröße" named nothing on them.
   */
  size?: { kind: 'symbol'; max: number; fallback: number; note: string | null; cut?: false } | { kind: 'cards' } | { kind: 'board' };
  /**
   * The margin round each symbol, always called „Rand", and the note under it
   * saying what it is for here: round a symbol in a strip, round a card to be
   * cut and laminated, round a card in its field on a Tafel, round a symbol
   * on a sheet that is not cut apart.
   */
  margin?: 'strip' | 'cut' | 'air' | 'symbol';
  /** The word on each card: whether, where and how big. */
  label?: boolean;
  frames?: boolean;
  /** A colour behind each card. */
  background?: boolean;
  /** A frame around a whole strip, as well as around each card. */
  stripFrame?: boolean;
  cutLines?: boolean;
  /** The line as written, over or under its pictures, and how big: a strip's, a Lied's. */
  sentence?: boolean;
  /** Satzstreifen as strips: one to a page. */
  onePerPage?: boolean;
  /** Lied: the headings over the parts, and „2×". */
  songChecks?: boolean;
  /**
   * The title: `pages` asks „Aus · Erste Seite · Jede Seite", `once` only
   * „Aus · Drucken" — a Tafel is one sheet, and an Einkaufsliste's title has
   * its own places. What it says is written in Bearbeiten, never here.
   */
  title?: 'pages' | 'once';
  /** A colour behind the whole page. An Einkaufsliste's is behind its board's page only. */
  page?: boolean;
  /** „Seite 1 von 3" at the foot of each page. */
  pageNumbers?: boolean;
  /** A Tafel: its free fields drawn dashed, as places for cards to come. */
  freeFields?: boolean;
  /** An Einkaufsliste: the guide under its cards. */
  guide?: boolean;
  /** An Einkaufsliste: the colour of its cart. */
  cart?: boolean;
}

/**
 * A template: how it is typed into, and how it prints.
 *
 * Everything in the app that has to ask „which template is this?" asks here,
 * so that the answer for a new template is written once, in one place, and a
 * question nobody remembered to answer for it is a type error rather than a
 * Lied that cannot be printed on A5.
 *
 * How it prints is two lists and no code path of its own: what it starts on
 * (`defaults`, under whatever this Sammlung set for itself) and what it always
 * is (`fixed`, over everything). `openPrint` puts them together, the same way
 * for every template, and the print view puts them together again on every
 * change — so a value that follows from another (an Einkaufsliste's
 * millimetres from its paper) follows it without a hook of its own.
 */
export interface Template {
  /** Holds one-word cards: the wall of cards, the tray, the counter that says „Karten". */
  cards: boolean;
  /**
   * Sets its look in Bearbeiten, in the Zeile over the material (Seite ·
   * Titel · Symbol), so the print preview shows no settings column for it.
   * Set template by template as each one moves (2026-10-22).
   */
  zeileInEdit?: true;
  /** What a Sammlung of this template prints with until it sets something else. */
  defaults?(print: PrintSettings, board: Grid | null): Partial<PrintSettings>;
  /** What it always prints with, whatever was set: worked out from the rest, so it follows it. */
  fixed?(settings: PrintSettings, board: Grid | null): Partial<PrintSettings>;
  offers(settings: PrintSettings): PrintOffer;
}

/** The columns and rows of a Tafel, which its print is measured from. */
type Grid = Pick<Board, 'cols' | 'rows'> & { airMm?: number | null };

/**
 * The settings a Sammlung prints with: `print`, what every Sammlung starts
 * from; its template's defaults over that, under what the Sammlung set for
 * itself (`own`); and what the template always is over all of it.
 */
export function openPrint(
  which: CollectionKind, print: PrintSettings, own: Partial<PrintSettings>, board: Grid | null,
): PrintSettings {
  const template = TEMPLATES[which];
  const set = { ...print, ...template.defaults?.(print, board), ...own };
  return settle(which, set, board);
}

/** What a template always is, over settings that just changed. */
export function settle(which: CollectionKind, settings: PrintSettings, board: Grid | null): PrintSettings {
  const fixed = TEMPLATES[which].fixed?.(settings, board);
  return fixed ? { ...settings, ...fixed } : settings;
}

/* What every template offers, unless the paper decides otherwise. */
const BASE: PrintOffer = {
  paper: true, title: 'pages', label: true, frames: true, background: true, page: true, pageNumbers: true,
};

/* An Einkaufsliste's own colours until it is given others: a light green page,
   its cart and its name in a darker one — the first one made, Markt. */
const SHOP_PAGE = '#d9ebd3';
const SHOP_GREEN = '#3d7d3a';

/* The title as a Rezept, a Lied and an Einkaufsliste start: printed, 15 pt,
   with a line under it, over the first page. */
const HEADED: Partial<PrintSettings> = {
  showCollectionTitle: true, titleSizePt: 15, titleColour: null, titleLine: true, titleEvery: false,
};

export const TEMPLATES: Record<CollectionKind, Template> = {
  /* Prints as strips, and only as strips: the template is the choice. Cards
     to cut out are the Wortkarten's, so a remembered card sheet here — from
     when a Satzstreifen could be printed as one — opens as strips again. */
  satzstreifen: {
    cards: false,
    zeileInEdit: true,
    fixed: () => ({ layout: 'strip' }),
    offers: () => ({
      ...BASE, size: { kind: 'symbol', max: 120, fallback: 40, note: null }, margin: 'strip',
      sentence: true, stripFrame: true, onePerPage: true,
    }),
  },

  /* Opens on the card sheet, and only there: a strip of one symbol is a card
     with the wrong margins, so a remembered strip here is the other
     template's setting arriving in this one. */
  wortkarten: {
    cards: true,
    zeileInEdit: true,
    fixed: () => ({ layout: 'sheet' }),
    offers: () => ({ ...BASE, size: { kind: 'cards' }, margin: 'cut', cutLines: true }),
  },

  /* Prints as the grid it is. Its columns and rows are the Sammlung's, not
     the dialog's — the dialog's are for a deck being asked to *become* a grid.
     And the air around each card rather than the cutting margin, which on a
     Tafel is the same number under another name: what this Tafel set for
     itself when it has, otherwise from the size of a field on this paper, so
     a crowded A5 gets less than a roomy A4. Its free fields dashed only
     when this Tafel asked: a middle left free for Klett is a fact about one
     board, and the next one's free fields may be air. And a colour behind
     the whole page, so a household's three boards are told apart by it. One
     sheet, so its title is over that sheet and nowhere else. */
  tafel: {
    cards: true,
    zeileInEdit: true,
    defaults: (_print, board) => {
      const grid = board ?? boardOf({});
      const page = printableArea('a4', 'landscape');
      const field = Math.min(page.width / grid.cols, page.height / grid.rows);
      /* Quer, wie eine Tafel hängt: breiter als hoch (2026-10-23, ihr Standard). */
      return { paper: 'a4', orientation: 'landscape', cutMarginMm: grid.airMm ?? defaultAirMm(field), markFreeFields: false };
    },
    fixed: (_settings, board) => {
      const grid = board ?? boardOf({});
      return { layout: 'sheet', sheetFit: 'grid', gridCols: grid.cols, gridRows: grid.rows, titleEvery: false };
    },
    offers: () => ({ ...BASE, size: { kind: 'board' }, margin: 'air', title: 'once', freeFields: true }),
  },

  /* Brings its own millimetres. Fifteen zones beside fifteen more on one
     A4 sheet is only possible at 20 mm, measured rather than chosen — and a
     3 mm laminating margin, because 5 mm around a 20 mm card is a third of the
     card. Facts about this material, not preferences. So the paper is all it
     is asked, and its name: on A3 or A5 the whole of it grows or shrinks by
     the same factor, always lying on its side. The name over the board as
     everywhere, its size, colour and line. A colour behind the board's page,
     as a Tafel has, and its cart drawn in a colour to go with it — the board
     only: the cards and their places are cut and stored, not hung up. No
     frame and no background on a card, and the cut lines
     always on — round the cards to cut, which are the only thing cut. */
  einkaufsliste: {
    cards: true,
    zeileInEdit: true,
    defaults: () => ({
      paper: 'a4', ...HEADED, titleColour: SHOP_GREEN,
      showGuide: true, pageColour: SHOP_PAGE, cartColour: SHOP_GREEN,
      /* Starts as it always printed — but these are choices now, made in the
         Zeile like everywhere else, not facts of the board: a frame, a ground,
         the cut lines. The word is not among them: the board writes it on the
         place itself and leaves the cards to cut wordless, so the game of
         matching card to place works — a fact of the material, not a setting. */
      cardBorderMm: 0, cardBackground: null, showCutLines: true,
    }),
    fixed: (settings) => {
      const k = SHOPPING_SCALE[settings.paper];
      return {
        layout: 'einkaufsliste', orientation: 'landscape',
        symbolSizeMm: Math.round(20 * k), cutMarginMm: Math.round(3 * k * 2) / 2,
        showLabel: true, labelSizePt: Math.round(11 * k * 2) / 2, titleEvery: false,
      };
    },
    offers: () => ({ paper: 'size', title: 'once', page: true, pageNumbers: true, cart: true, guide: true }),
  },

  /* Opens on one A4 page standing up, its name at the top, cards small
     enough that the Zutaten, the Hilfsmittel and the first Schritte share it.
     The paper is a choice, as a Lied's is — a recipe goes on the fridge in
     A4 and into a folder in A5 — and so is the size, because a child who
     needs bigger pictures gets a second page rather than smaller ones. */
  rezept: {
    cards: false,
    zeileInEdit: true,
    defaults: () => ({
      paper: 'a4', orientation: 'portrait', symbolSizeMm: 20, cutMarginMm: 1.5,
      showLabel: true, labelPosition: 'below', labelSizePt: 9, cardBorderMm: 0, cardBackground: null,
      ...HEADED, showPageNumbers: false,
    }),
    fixed: () => ({ layout: 'rezept' }),
    offers: () => ({
      ...BASE, size: { kind: 'symbol', max: 60, fallback: 20, note: null, cut: false }, margin: 'symbol', colour: true,
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
    cards: false,
    zeileInEdit: true,
    defaults: () => ({
      paper: 'a4', orientation: 'portrait', symbolSizeMm: 16, cutMarginMm: 1,
      showLabel: true, labelPosition: 'below', labelSizePt: 9, cardBorderMm: 0, cardBackground: null,
      ...HEADED, showSentenceText: false, sentencePosition: 'above', sentenceSizePt: 10,
      showPageNumbers: false, songRefrainOnce: false, accentColour: '#2c66c8',
    }),
    fixed: () => ({ layout: 'lied' }),
    offers: () => ({
      ...BASE, size: { kind: 'symbol', max: 60, fallback: 16, note: null, cut: false }, margin: 'symbol',
      colour: true, sentence: true, songChecks: true,
    }),
  },

  /* Opens on A4 lying on its side, one sheet per few rows: left the Ablage
     the cut cards live on, right the rows with a dashed Klett field per card
     — the sheet is laminated whole and goes into a folder. The cards come on
     sheets of their own, at the fields' size, as a Plauderbuch's do. The
     paper is a choice; everything grows with it, cards and fields together. */
  spiel: {
    cards: false,
    defaults: () => ({
      paper: 'a4', orientation: 'landscape',
      showLabel: true, labelPosition: 'below', labelSizePt: 11,
      ...HEADED, showPageNumbers: false,
    }),
    fixed: () => ({ layout: 'spiel' }),
    zeileInEdit: true,
    offers: () => ({ ...BASE }),
  },

  /* Opens on A5 lying on its side, the Plauderplan-Drehbuch's paper: it goes
     into an A5 ring binder. The paper is all it is asked, and which way up;
     the fields and the cards grow with it (talkGeometry), as an
     Einkaufsliste's do. Always to velcro — empty fields on the pages, the
     cards on sheets of their own — and always a free field for the answer.
     No name over the first page: every sheet is a page of the book. Page
     numbers as everywhere, off until asked for. */
  plauderbuch: {
    cards: false,
    zeileInEdit: true,
    defaults: () => ({ paper: 'a5', orientation: 'landscape', showPageNumbers: false, ...HEADED }),
    fixed: () => ({ layout: 'plauderbuch' }),
    offers: () => ({ paper: true, pageNumbers: true, title: 'once' }),
  },
};
