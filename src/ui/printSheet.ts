import type {
  Orientation, PaperSize, PrintSettings, ProviderId, Sentence, Slot, SongPartKind, ZoneStyle,
} from '../core/types.ts';
import { partOf, slotCaption, symbolIdFor, titlePicture } from '../core/types.ts';
import { foldRepeats } from '../core/song.ts';

/** The margin @page reserves at the top and sides. Millimetres, because the sheet is. */
export const PAGE_MARGIN_MM = 10;

/**
 * The margin at the foot, narrower than the rest: the only thing that stands in
 * it is the licence line, small and grey, and it reads as a footnote when it
 * sits close to the edge rather than as one more row of the page. 6mm and not
 * less, because that is about the edge an ordinary printer can still reach.
 */
export const PAGE_MARGIN_BOTTOM_MM = 6;

/**
 * Paper, in millimetres, short edge first.
 *
 * Given as numbers rather than as the CSS keywords A4/A5/A3, because the same
 * figures have to do two different jobs: @page needs a size to tell the printer,
 * and the card grid needs to divide the printable area. Two sources for one
 * paper is how a preview comes to disagree with what comes out of the printer.
 */
const PAPER: Record<PaperSize, { short: number; long: number; label: string }> = {
  a5: { short: 148, long: 210, label: 'A5' },
  a4: { short: 210, long: 297, label: 'A4' },
  a3: { short: 297, long: 420, label: 'A3' },
};

export const paperLabel = (paper: PaperSize): string => PAPER[paper].label;

/** The sheet's outside size — what the paper measures before margins. */
export function paperSize(
  paper: PaperSize, orientation: Orientation,
): { width: number; height: number } {
  const { short, long } = PAPER[paper];
  const landscape = orientation === 'landscape';
  return { width: landscape ? long : short, height: landscape ? short : long };
}

/** The area a page actually has for cards, once the margin is taken off. */
export function printableArea(
  paper: PaperSize, orientation: Orientation,
): { width: number; height: number } {
  const { width, height } = paperSize(paper, orientation);
  return { width: width - 2 * PAGE_MARGIN_MM, height: height - PAGE_MARGIN_MM - PAGE_MARGIN_BOTTOM_MM };
}

/**
 * The frame's inner padding. Rounded corners need room, or the corner clips the
 * symbol — the METACOM manual makes the same point. Derived rather than asked
 * for: it is a consequence of the radius, not a separate decision.
 */
export function framePadMm(settings: PrintSettings): number {
  return +(1 + settings.cardRadiusMm / 3).toFixed(2);
}

/*
 * @page cannot be written from a class or read a custom property, so the one
 * rule that decides what the paper is has to be a stylesheet of its own.
 * Kept as a single element that is rewritten rather than added to, so repeated
 * paints cannot stack up conflicting page rules.
 */
const PAGE_STYLE_ID = 'print-page-setup';

/**
 * `bleed`: a Tafel, or an Einkaufsliste's board, on a colour of its own. The paper then has no margin of its
 * own and the page box carries it inside, on the colour, so the colour reaches
 * the paper's edge — as far as the printer can print, which is its business.
 */
export function applyPageSetup(paper: PaperSize, orientation: Orientation, bleed = false): void {
  const style = document.getElementById(PAGE_STYLE_ID) ?? (() => {
    const made = document.createElement('style');
    made.id = PAGE_STYLE_ID;
    return document.head.appendChild(made);
  })();
  const { width, height } = paperSize(paper, orientation);
  /*
   * An explicit size rather than the `A4 landscape` keyword pair: the keywords
   * only cover the standard papers, and stating the millimetres keeps this rule
   * and printableArea() reading from the same table.
   */
  const margin = bleed ? '0' : `${PAGE_MARGIN_MM}mm ${PAGE_MARGIN_MM}mm ${PAGE_MARGIN_BOTTOM_MM}mm`;
  style.textContent = `@page { size: ${width}mm ${height}mm; margin: ${margin}; }`;
}

/**
 * METACOM's copyright notice, in the wording its terms give.
 *
 * It lives here rather than in bildquelle on purpose. bildquelle reports
 * METACOM's attribution as null, and that is correct: printing a board from a
 * licence you own carries no attribution obligation, so nothing should be
 * forced onto the page. This is the other case — material that leaves the house
 * — and it is a choice the person printing makes, not a property of the source.
 */
export const METACOM_COPYRIGHT = 'METACOM Symbole © Annette Kitzinger';

/** The licence notice for these symbols, when the person asked for it printed. Only METACOM has one. */
export const copyrightFor = (provider: ProviderId, wanted: boolean): string | null =>
  provider === 'metacom' && wanted ? METACOM_COPYRIGHT : null;

/**
 * The lines at the foot of every page: where the symbols come from, then their
 * notice. One list, asked by the sheet that prints it and by the Tafel on
 * screen that sizes its fields from the room it leaves.
 */
export const creditLines = (attribution: string | null, copyright: string | null): string[] =>
  [attribution, copyright].filter((line): line is string => Boolean(line));

/**
 * Where the printout came from, written out in full.
 *
 * "erstellt mit bildhaft" named the tool to somebody who already knew it. The
 * paper outlives the tab it was printed from and travels further: a strip goes
 * home in a school bag, a board goes up on a wall a colleague sees. The name
 * alone leaves them a word to search for; the address leaves them the thing.
 *
 * A real link rather than text, because a sheet is not always paper — printing
 * to PDF and sending that on is the ordinary way this material is shared, and a
 * link that survives that costs nothing on the page it is printed on.
 */
export const BILDHAFT_URL = 'https://bildhaft.lautstark.tech';

/*
 * Vertical room set aside on a grid page for the credit block.
 *
 * A grid page is exactly as tall as the paper, so anything after it starts a
 * new sheet — and a sheet carrying nothing but a copyright notice is a wasted
 * page and an obviously wrong printout. Reserved on every page rather than only
 * the last, because the alternative is cards of two different sizes in one deck.
 *
 * Sized from the credits themselves: the block's padding plus the lines its
 * text comes to at this paper's width. It used to allow two lines per credit
 * and one more on every paper, which ARASAAC's sentence needs on a narrow page
 * but METACOM's one short line never does — on an A4 Tafel that was a centimetre
 * of empty paper over the notice, taken from every field. A line is counted
 * from its characters at a generous average width, so the estimate errs long.
 * „, erstellt mit https://bildhaft.lautstark.tech" rides on the last credit's
 * line and is kept whole, so it counts as a line of its own wherever it would
 * not fit beside it. e2e asserts the block actually fits inside this, on the
 * narrowest paper.
 */
/** 6.5pt of type at 1.4 line-height, in millimetres. */
const CREDIT_LINE_MM = 3.2;
/** The block's padding-top and a little air over it. */
const CREDIT_CHROME_MM = 3;
/** One character of 6.5pt type, on the wide side of average. */
const CREDIT_CHAR_MM = 1.3;
/** „, erstellt mit https://bildhaft.lautstark.tech", the longer of its languages. */
const CREDIT_TAIL_CHARS = 47;

function creditAllowanceMm(credits: string[], widthMm: number): number {
  const perLine = Math.max(1, Math.floor(widthMm / CREDIT_CHAR_MM));
  let lines = 0;
  let left = 0;
  for (const credit of credits) {
    lines += Math.max(1, Math.ceil(credit.length / perLine));
    left = perLine - (credit.length % perLine || perLine);
  }
  if (CREDIT_TAIL_CHARS > left) lines += 1;
  return CREDIT_CHROME_MM + CREDIT_LINE_MM * lines;
}

/*
 * Vertical room set aside on a grid page for the collection's name.
 *
 * Reserved on every page although the heading only prints on the first, for the
 * reason the credit block gives above: a grid that divided the first page by a
 * smaller figure than the rest would hand back a deck whose first six cards are
 * a different size from the other twelve. Two lines are allowed, because a
 * collection is named by the person who made it and "Kindergarten Sonnenschein
 * – Morgenkreis" is the kind of name they give it.
 */
/** Millimetres in a point. */
const PT_MM = 25.4 / 72;
/** The heading's line-height. */
const TITLE_LEADING = 1.3;
/** The heading's margin-bottom. */
const TITLE_GAP_MM = 4;
/** The line under it, when asked for: its padding-bottom and its own thickness. */
export const TITLE_RULE_GAP_MM = 1.5;
export const TITLE_RULE_MM = 0.6;

/**
 * The title picture's box, `.ps-title__pic`: three times the title's size, so
 * it grows and shrinks with the name beside it — 25 mm by a 24 pt name, 16 mm
 * by a 15 pt one. The sheet sets it as `--title-pic` from here, so the room
 * reserved and the box drawn are the one number.
 */
export const titlePictureMm = (titleSizePt: number): number => 3 * titleSizePt * PT_MM;

/**
 * Whether a page carries the Sammlung's name, and how: not at all, as words,
 * or as words beside its picture.
 */
export type Titled = false | 'text' | 'pictured';

/**
 * The heading as it is set, two lines of it: its size and its line are the
 * person's to choose. With its picture it is as tall as the taller of the two,
 * which on a Tafel is the picture, and every field is shorter by it.
 */
function titleAllowanceMm(settings: Pick<PrintSettings, 'titleSizePt' | 'titleLine'>, titled: Titled): number {
  const words = 2 * settings.titleSizePt * PT_MM * TITLE_LEADING;
  return TITLE_GAP_MM + (titled === 'pictured' ? Math.max(words, titlePictureMm(settings.titleSizePt)) : words)
    + (settings.titleLine ? TITLE_RULE_GAP_MM + TITLE_RULE_MM : 0);
}

/**
 * The heading's colour: its own when it was given one, else the material's —
 * a Rezept's or a Lied's colour, black for a material that has none.
 */
export function titleColour(settings: Pick<PrintSettings, 'titleColour' | 'layout' | 'accentColour'>): string {
  if (settings.titleColour !== null) return settings.titleColour;
  return settings.layout === 'rezept' || settings.layout === 'lied' ? settings.accentColour : '#000000';
}

/** The line a page number stands on, kept free at the foot of every page when it is asked for. */
export const PAGE_NUMBER_MM = 5;

/* --------------------------------------------------------------- pages --- */

/** Millimetres at the CSS reference resolution of 96dpi. */
export const PX_PER_MM = 96 / 25.4;

/**
 * Where the pages fall, measured off a sheet that is in the document.
 *
 * The grid decides its own pages — that is the whole of `cardSheet()`. Nothing
 * else did: a strip sheet was one long column that the browser broke wherever
 * it happened to break, which the preview could not show and nobody could count
 * before pressing Print. So the cut is worked out here, once, and both copies
 * are built from the answer — the same rule the grid already follows, and the
 * reason the preview can now be page boxes rather than a scroll.
 *
 * Measured rather than derived, because the heights are not knowable from the
 * settings: a caption that wraps makes its strip taller, and how many cards fit
 * across a row depends on a frame that may or may not be drawn. Only the sheet
 * on screen knows. #print-root is `display: none` and so has no heights at all,
 * which is why this returns a plan to apply to it rather than measuring it too.
 */
export interface SheetPlan {
  /** A card sheet sized in millimetres: how many cards each row came out with. */
  rows: number[] | null;
  /** How many blocks each page holds, in order. One entry per page, or null
   *  while the sheet is still being measured and stands unpaged. */
  pages: number[] | null;
}

/** A sheet that has been measured for neither of the two answers yet. */
export const UNPLANNED: SheetPlan = { rows: null, pages: null };

/** A block's own height and the margins above and below it, in pixels. */
function outer(node: HTMLElement): { top: number; height: number; bottom: number } {
  const style = getComputedStyle(node);
  return {
    top: parseFloat(style.marginTop),
    height: node.offsetHeight,
    bottom: parseFloat(style.marginBottom),
  };
}

/**
 * How many cards each row of a flowing card sheet took.
 *
 * By where they landed, not by dividing the page: `.ps-row` wraps, and what it
 * fits depends on the frame and the cut margin as laid out rather than as
 * specified. Cards on one row share an offsetTop because the row is a flex line.
 *
 * Read off the sheet while it still has its one flowing row, which is the
 * shape `UNPLANNED` draws. The answer goes back in as `plan.rows` and the
 * component draws one `.ps-row` per line — where the hand-written sheet cut the
 * row up in place, and had to be careful not to do it twice.
 */
export function cardRows(sheet: HTMLElement): number[] | null {
  const row = sheet.querySelector<HTMLElement>(':scope > .ps-row');
  if (!row) return null;
  const rows: number[] = [];
  let top: number | null = null;
  for (const card of row.querySelectorAll<HTMLElement>(':scope > .ps-card')) {
    if (card.offsetTop !== top) { rows.push(0); top = card.offsetTop; }
    rows[rows.length - 1]! += 1;
  }
  return rows;
}

/** Sub-pixel slack, so a block that fits exactly is not pushed off the page. */
const FIT_TOLERANCE = 0.5;

/**
 * Where the pages fall, measured off a sheet that is in the document.
 *
 * The grid decides its own pages — that is the whole of the card grid. Nothing
 * else did: a strip sheet was one long column that the browser broke wherever
 * it happened to break, which the preview could not show and nobody could count
 * before pressing Print. So the cut is worked out here, once, and both copies
 * are drawn from the answer — the same rule the grid already follows, and the
 * reason the preview can be page boxes rather than a scroll.
 *
 * Measured rather than derived, because the heights are not knowable from the
 * settings: a caption that wraps makes its strip taller, and how many cards fit
 * across a row depends on a frame that may or may not be drawn. Only the sheet
 * on screen knows. #print-root is `display: none` and so has no heights at all,
 * which is why this returns a plan for the component to draw rather than
 * measuring both copies.
 *
 * It reads and never writes. The splitting it used to do first is `plan.rows`
 * now, applied by the component in the paint before this one.
 */
export function planPages(sheet: HTMLElement, settings: PrintSettings): number[] {
  const blocks = [...sheet.children] as HTMLElement[];
  /*
   * The credit block is not packed with the rest. It is the foot of every
   * page — one line with the page number at its right — so that a sheet
   * handed on alone still carries the notice its symbols need. Its room is
   * taken off every page, and it is drawn there, not here.
   */
  const credit = blocks.at(-1)?.classList.contains('ps-attribution') ? blocks.pop()! : null;
  const foot = Math.max(
    credit ? outer(credit).top + outer(credit).height : 0,
    settings.showPageNumbers ? PAGE_NUMBER_MM * PX_PER_MM : 0,
  );
  const limit = printableArea(settings.paper, settings.orientation).height * PX_PER_MM - foot;

  const pages: number[] = [];
  const filled: number[] = [];
  let count = 0;
  let used = 0;

  const close = () => { pages.push(count); filled.push(used); count = 0; used = 0; };

  for (const block of blocks) {
    const box = outer(block);
    // A block that will not fit in what is left starts the page it needs. Its
    // margin below counts: a page is a flex column, so the last block's margin
    // stays on the page rather than collapsing into the foot, and leaving it
    // out let a full page push its foot that much further down than the rest.
    if (count > 0 && used + box.top + box.height + box.bottom > limit + FIT_TOLERANCE) close();
    count += 1;
    used += box.top + box.height + box.bottom;
    // A grid page is a page by construction, "one sentence per page" says so,
    // and a block that ends its sheet (an Einkaufsliste's last row of places).
    if (block.classList.contains('ps-grid') || block.classList.contains('ps-sentence--page')
      || block.classList.contains('ps-break')) {
      close();
    }
  }
  if (count > 0) close();
  if (pages.length === 0) { pages.push(0); filled.push(0); }
  return pages;
}

/* ---------------------------------------------------------------- blocks -- */

/**
 * A Tafel as it goes to paper: the grid, with the card lying in each field or
 * nothing. Resolved to the cards themselves rather than to ids, because the
 * sheet does not know the Sammlung — only what to draw where.
 */
export interface PrintBoard {
  cols: number;
  rows: number;
  cells: (Sentence | null)[];
  /** The group of each field, or nothing — `zonesOf()` the board. */
  zones?: (string | null)[];
  /** How each group is drawn — `stylesOf()` the board. */
  styles?: Record<string, ZoneStyle>;
}

/**
 * A Lied as it goes to paper: its parts in the order they are sung, each with
 * its rows. A Refrain sung five times is here five times — the paper is
 * written out the way the song goes.
 */
export interface PrintSong {
  /** `first` is the part's first time in the song: a Refrain sung again is not. */
  parts: { kind: SongPartKind; n: number; first: boolean; lines: Sentence[] }[];
}

/** A Plauderbuch's pages as they print: the question, then the Aussagen. */
export interface PrintTalk {
  pages: { question: Sentence | null; sayings: Sentence[] }[];
}

export interface SheetOptions {
  sentences: Sentence[];
  /** Set for a Lied, and then it decides what is printed and in what order. */
  song?: PrintSong | null;
  /** Set for a Plauderbuch, and then it decides the pages. */
  talk?: PrintTalk | null;
  /** Set for a Tafel, and then it decides the page; `sentences` are the cards on it. */
  board?: PrintBoard | null;
  settings: PrintSettings;
  provider: ProviderId;
  /** Mandatory for ARASAAC; printed at the foot of the output. */
  attribution: string | null;
  /** The METACOM notice, when the user has asked for it. */
  copyright: string | null;
  collectionName: string;
  /** A Tafel's title picture, printed before its name. A Rezept's is found among its rows. */
  picture?: Slot | null;
}

/** The height a page sets aside for what is not the grid: credits, the Sammlung's name, the page number. */
function reserveMm(
  settings: Pick<PrintSettings, 'paper' | 'orientation' | 'titleSizePt' | 'titleLine' | 'showPageNumbers'>,
  credits: string[], titled: Titled,
): number {
  return (credits.length > 0 ? creditAllowanceMm(credits, printableArea(settings.paper, settings.orientation).width) : 0)
    + (titled ? titleAllowanceMm(settings, titled) : 0)
    + (settings.showPageNumbers ? PAGE_NUMBER_MM : 0);
}

/**
 * One field of a Tafel on paper, in millimetres: the page the grid is given,
 * divided by its columns and rows. Asked by the sheet, which draws it, and by
 * the Tafel on screen, which takes its fields' shape from it — so a field is
 * as tall for its width while it is filled as when it is printed.
 */
export function tafelFieldMm(
  settings: Pick<PrintSettings, 'paper' | 'orientation' | 'showPageNumbers' | 'titleSizePt' | 'titleLine'>,
  grid: { cols: number; rows: number }, credits: string[], titled: Titled,
): { width: number; height: number } {
  const page = printableArea(settings.paper, settings.orientation);
  const height = page.height - reserveMm(settings, credits, titled);
  return { width: page.width / grid.cols, height: height / grid.rows };
}

/**
 * One block of the printable document: the thing a page is packed out of.
 *
 * Data rather than nodes, and that is the change this file went through. The
 * sheet used to be built twice as DOM, measured, cut up in place and the cut
 * applied to both copies; the blocks are described once here, and
 * `PrintSheet.svelte` draws the description — into the preview and into
 * #print-root — from the one plan. What the printer gets and what the preview
 * shows cannot differ, because neither worked anything out on its own.
 */
export type Block =
  /* `picture`: a Rezept's or a Tafel's title picture, printed before the name. */
  | { kind: 'title'; text: string; picture?: Slot | null }
  | { kind: 'strip'; sentence: Sentence; page: boolean; framed: boolean }
  | { kind: 'row'; slots: Slot[] }
  | { kind: 'grid'; slots: Slot[]; cols: number; cellH: string; page: boolean }
  | { kind: 'tafel'; board: PrintBoard; cellH: string }
  | { kind: 'shopping-board'; zoneMm: number; cartW: number; cartH: number; k: number }
  /* `guide`: the first sheet of cards says, under them, what the three sheets are for. */
  | { kind: 'cut'; slots: Slot[]; guide: boolean }
  /* One row of the places: a page then holds as many rows as fit under the
     name, and the rest go on. `last` ends the places' sheet. */
  | { kind: 'store'; slots: Slot[]; last: boolean }
  | { kind: 'recipe-part'; part: 'zutat' | 'hilfsmittel'; slots: Slot[] }
  | { kind: 'recipe-step'; n: number; slots: Slot[]; first: boolean }
  | { kind: 'song-part'; part: SongPartKind; n: number; groups: { lines: Sentence[]; times: number }[] }
  | { kind: 'song-again' }
  | { kind: 'talk-page'; question: Slot | null; text: string; count: number; free: boolean; again: boolean; geo: TalkGeometry }
  | { kind: 'talk-cut'; slots: Slot[]; cols: number; geo: TalkGeometry }
  | { kind: 'credit'; lines: string[] };

/**
 * A Plauderbuch page, measured: how big a field is, how many go across and
 * down, and the paper's factor everything else is multiplied by.
 *
 * The paper is all it is asked, as an Einkaufsliste's is. The page is laid
 * out for A5 and grows with the paper — A4 by √2, A3 by 2 — so the fields
 * and the cards cut for them are bigger together. Lying on its side three
 * fields go across and two down, as in the Plauderplan-Drehbuch; standing up,
 * two across and three down. The fields take the width; their height is a
 * card's (3 : 5) unless the sheet is too short for that, and what the
 * footer needs comes off first.
 */
export interface TalkGeometry {
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
  gap: number;
  /** The band's inner padding, and the air round a card on the cutting sheet. */
  air: number;
  /** The paper's factor against A5. */
  k: number;
  /** The page's height, the footer's room taken off. */
  height: number;
}

export const TALK_SCALE: Record<PaperSize, number> = { a5: 1, a4: Math.SQRT2, a3: 2 };

export function talkGeometry(
  settings: Pick<PrintSettings, 'paper' | 'orientation'>, page: { width: number; height: number }, reserve: number,
): TalkGeometry {
  const k = TALK_SCALE[settings.paper];
  const landscape = settings.orientation === 'landscape';
  const cols = landscape ? 3 : 2;
  const rows = landscape ? 2 : 3;
  const gap = 6 * k;
  const air = 3 * k;
  const height = page.height - reserve;
  const cardW = (page.width - (cols - 1) * gap) / cols;
  const cardH = Math.min(cardW * 0.62, (height - 2 * air - 8 * k - (rows - 1) * gap) / (rows + 1));
  return { cols, rows, cardW, cardH, gap, air, k, height };
}

/**
 * How many zones a block of the board holds, and how they are arranged.
 *
 * Fifteen and fifteen, in the shapes that fit beside each other on a landscape
 * sheet: a tall block to shop from, a wide one in the cart. Measured rather than
 * chosen — at 25 mm cards the two blocks come to 302 mm and the sheet is 277.
 */
export const SHOPPING = { list: { cols: 3, rows: 5 }, cart: { cols: 5, rows: 3 } };

/**
 * How much bigger an Einkaufsliste comes out than on A4, which it was measured
 * on. All of it by the same factor — cards, zones, the air between them, the
 * cart — so a card printed on A3 goes into a board printed on A3, and the
 * sheets hold as many on every paper as they do on A4.
 */
export const SHOPPING_SCALE: Record<PaperSize, number> = { a5: 0.7, a4: 1, a3: 1.4 };

/** The air a laminated card needs before it will go into a zone at all. */
const ZONE_AIR_MM = 3;
const ZONE_GAP_MM = 2;
/* What the cart reaches beyond its basket — handle up and out, wheels below —
   is in print.css as the margins around `.ps-cart` and the board's own gap.
   Kept there rather than here because it is room on the page, and the page is
   what that file is about. Change one and check the other. */

/** How many cards of an Einkaufsliste go on one sheet to cut. Its places go in rows, as many as fit. */
const SHOPPING_PER_PAGE = 35;

/**
 * The cards a deck comes to, with the duplicates collapsed.
 *
 * A card is a symbol *and* the word under it, so both decide whether two uses
 * are the same card. Keying on the symbol alone printed one card for a symbol
 * whose caption had been rewritten in one sentence and not the other, and
 * silently dropped whichever wording came second.
 */
function deck(sentences: Sentence[], provider: ProviderId): Slot[] {
  const seen = new Set<string>();
  const cards: Slot[] = [];
  for (const sentence of sentences) {
    for (const slot of sentence.slots) {
      const key = `${symbolIdFor(slot, provider) ?? 'blank'}|${slotCaption(slot).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(slot);
    }
  }
  return cards;
}

const chunks = <T,>(all: T[], per: number): T[][] => {
  const out: T[][] = [];
  for (let start = 0; start < Math.max(all.length, 1); start += per) out.push(all.slice(start, start + per));
  return out;
};

/**
 * The printable document, described.
 *
 * `rows` is the answer `cardRows()` measured off the previous paint: with it a
 * flowing card sheet is one `.ps-row` per line of cards, which is what lets a
 * page hold whole lines. Without it the sheet's only block is the row itself,
 * and a sheet of forty cards would be one indivisible block eight pages tall.
 */
export function sheetBlocks(options: SheetOptions, rows: number[] | null): Block[] {
  const { sentences, board, song, talk, settings, provider, attribution, copyright, collectionName } = options;
  const credits = creditLines(attribution, copyright);
  const page = printableArea(settings.paper, settings.orientation);
  const blocks: Block[] = [];

  /*
   * Once, above everything, rather than per page: a header repeated on every
   * sheet would cost the grid its room on all of them, and what this answers is
   * "which collection is this printout" — a question a stack of paper asks once.
   * An Einkaufsliste asks it twice: its board and its places hang apart.
   */
  const title = settings.showCollectionTitle ? collectionName.trim() : '';
  /* The name as it stands in Bearbeiten: a Rezept's or a Tafel's with its
     picture, when it was given one. The picture goes and comes with the name.
     A Tafel's comes from outside, because its cards are only the placed ones. */
  const picture = settings.layout === 'rezept' ? titlePicture(sentences) : options.picture ?? null;
  if (title) blocks.push({ kind: 'title', text: title, picture });
  const titled: Titled = !title ? false : picture ? 'pictured' : 'text';

  const reserve = reserveMm(settings, credits, titled);

  if (board) {
    blocks.push({
      kind: 'tafel', board,
      cellH: `${tafelFieldMm(settings, board, credits, titled).height.toFixed(3)}mm`,
    });
  } else if (settings.layout === 'einkaufsliste') {
    /* The zone in millimetres, which every part of this material is measured
       from — and which the cart has to be told, because its drawing *is* the
       block of zones and a hard-coded viewBox would stretch the moment somebody
       changes the card size. */
    const k = SHOPPING_SCALE[settings.paper];
    const zoneMm = settings.symbolSizeMm + 2 * settings.cutMarginMm + ZONE_AIR_MM * k;
    blocks.push({
      kind: 'shopping-board',
      zoneMm, k,
      cartW: SHOPPING.cart.cols * zoneMm + (SHOPPING.cart.cols - 1) * ZONE_GAP_MM * k,
      cartH: SHOPPING.cart.rows * zoneMm + (SHOPPING.cart.rows - 1) * ZONE_GAP_MM * k,
    });
    /* The two sheets that stay, the board and the places, first, each under
       the name; the cards to cut last, with the guide under them. */
    const cards = deck(sentences, provider);
    if (title) blocks.push({ kind: 'title', text: title, picture });
    /* As many places across as the page is wide; the place is its zone, and
       the air between two is the zones' own. */
    const zoneGap = ZONE_GAP_MM * k;
    const across = Math.max(1, Math.floor((page.width + zoneGap) / (zoneMm + zoneGap) + 1e-6));
    const rowsOf = chunks(cards, across);
    rowsOf.forEach((slots, at) => blocks.push({ kind: 'store', slots, last: at === rowsOf.length - 1 }));
    chunks(cards, SHOPPING_PER_PAGE).forEach((slots, at) => blocks.push({ kind: 'cut', slots, guide: settings.showGuide && at === 0 }));
  } else if (settings.layout === 'rezept') {
    /*
     * The Zutaten and the Hilfsmittel as a block each, and every Schritt as a
     * block of its own: a page then breaks between two Schritte and never
     * inside one, and a recipe longer than its page goes on, at the same size,
     * on the next. Nothing is collapsed — two cards saying „Schüssel" in the
     * Hilfsmittel are somebody's two bowls.
     */
    for (const part of ['zutat', 'hilfsmittel'] as const) {
      const slots = sentences.filter((sentence) => partOf(sentence) === part)
        .flatMap((sentence) => sentence.slots.slice(0, 1));
      if (slots.length > 0) blocks.push({ kind: 'recipe-part', part, slots });
    }
    sentences.filter((sentence) => partOf(sentence) === 'schritt').forEach((sentence, at) => {
      blocks.push({ kind: 'recipe-step', n: at + 1, slots: sentence.slots, first: at === 0 });
    });
  } else if (settings.layout === 'lied') {
    /*
     * A part is one block, so a page breaks between two parts and never
     * inside one: a Strophe split over two sheets is a child turning the page
     * in the middle of a line of song. With „2×" asked for, lines sung again
     * straight after themselves are printed once; otherwise every line is its
     * own group of one, which is the song written out.
     */
    for (const part of song?.parts ?? []) {
      /* Asked for, a Refrain sung again is a reference to the one above. */
      if (settings.songRefrainOnce && part.kind === 'refrain' && !part.first) {
        blocks.push({ kind: 'song-again' });
        continue;
      }
      blocks.push({
        kind: 'song-part', part: part.kind, n: part.n,
        groups: settings.songRepeats
          ? foldRepeats(part.lines)
          : part.lines.map((line) => ({ lines: [line], times: 1 })),
      });
    }
  } else if (settings.layout === 'plauderbuch') {
    /*
     * A page of the book is a sheet of paper, always: the question on its
     * band with the free field beside it, the fields for the Aussagen below.
     * More Aussagen than a sheet holds go on to the next sheet, the question
     * once more over them and no second free field — one answer per page.
     * Then the cards for every field, to cut out, at the size of the fields.
     */
    const geo = talkGeometry(settings, page, reserve);
    for (const one of talk?.pages ?? []) {
      const question = one.question?.slots[0] ?? null;
      const text = question ? slotCaption(question) : '';
      chunks(one.sayings, geo.cols * geo.rows).forEach((part, at) => blocks.push({
        kind: 'talk-page', question, text, count: part.length, free: at === 0, again: at > 0, geo,
      }));
    }
    const cards = (talk?.pages ?? []).flatMap((one) => one.sayings.flatMap((sentence) => sentence.slots.slice(0, 1)));
    /* As many across as the page has fields across, at least: the air round
       a card gives way first, down to none. */
    const air = Math.max(0, Math.min(geo.air, (page.width / geo.cols - geo.cardW) / 2));
    const cut = { ...geo, air };
    const cols = Math.max(1, Math.floor(page.width / (geo.cardW + 2 * air) + 1e-6));
    const rows = Math.max(1, Math.floor(page.height / (geo.cardH + 2 * air)));
    if (cards.length > 0) {
      for (const slots of chunks(cards, cols * rows)) blocks.push({ kind: 'talk-cut', slots, cols, geo: cut });
    }
  } else if (settings.layout === 'sheet') {
    const cards = deck(sentences, provider);
    if (settings.sheetFit !== 'grid') {
      /* One row, or as many rows as the last paint measured. */
      if (!rows || rows.length < 2) blocks.push({ kind: 'row', slots: cards });
      else {
        let taken = 0;
        rows.forEach((count, at) => {
          const last = at === rows.length - 1;
          blocks.push({ kind: 'row', slots: last ? cards.slice(taken) : cards.slice(taken, taken + count) });
          taken += count;
        });
      }
    } else {
      /*
       * Pages are cut here rather than left to the browser. Letting a single
       * grid paginate itself puts a row wherever the break happens to fall, so
       * the same board printed twice can come out with different rows on each
       * sheet — fatal for material that is meant to be cut into a fixed set of
       * cards.
       */
      const cols = Math.max(1, Math.round(settings.gridCols));
      const gridRows = Math.max(1, Math.round(settings.gridRows));
      const pages = chunks(cards, cols * gridRows);
      pages.forEach((slots, at) => blocks.push({
        kind: 'grid', slots, cols,
        cellH: `${((page.height - reserve) / gridRows).toFixed(3)}mm`,
        page: at < pages.length - 1,
      }));
    }
  } else {
    /* Sentence strips: one row per sentence, in reading order. */
    sentences.forEach((sentence, at) => blocks.push({
      kind: 'strip', sentence,
      page: settings.onePerPage && at < sentences.length - 1,
      framed: settings.stripFrame,
    }));
  }

  if (credits.length > 0) blocks.push({ kind: 'credit', lines: credits });
  return blocks;
}
