import type {
  Orientation, PaperSize, PrintSettings, ProviderId, Sentence, Slot, ZoneStyle,
} from '../core/types.ts';
import { slotCaption, symbolIdFor } from '../core/types.ts';

/** The margin @page reserves on every side. Millimetres, because the sheet is. */
export const PAGE_MARGIN_MM = 10;

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
  return { width: width - 2 * PAGE_MARGIN_MM, height: height - 2 * PAGE_MARGIN_MM };
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

export function applyPageSetup(paper: PaperSize, orientation: Orientation): void {
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
  style.textContent = `@page { size: ${width}mm ${height}mm; margin: ${PAGE_MARGIN_MM}mm; }`;
}

/** Puts the paper back to the stylesheet's default when the dialog goes away. */
export function clearPageSetup(): void {
  document.getElementById(PAGE_STYLE_ID)?.remove();
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
 * Sized rather than guessed: the block is its own margin and rule plus one line
 * per credit and one for the collection. Each credit is allowed two lines,
 * because ARASAAC's is a sentence long and wraps on a narrow page where
 * METACOM's does not. The collection's line gets one and is held to it: it
 * carries a name somebody chose, and a name long enough to wrap would otherwise
 * cost every card on every grid page 1.8mm of height to make room for a second
 * line that is usually empty. So the name is clipped instead — see .ps-made.
 * e2e asserts the block actually fits inside this, on the narrowest paper and
 * under a name long enough to be clipped.
 */
/** 7.5pt of type at 1.4 line-height, in millimetres. */
const CREDIT_LINE_MM = 3.7;
/** The block's margin-top, padding and rule. */
const CREDIT_CHROME_MM = 8;

function creditAllowanceMm(creditCount: number): number {
  return CREDIT_CHROME_MM + CREDIT_LINE_MM * (2 * creditCount + 1);
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
/** 12pt of type at 1.3 line-height, in millimetres. */
const TITLE_LINE_MM = 5.5;
/** The heading's margin-bottom. */
const TITLE_GAP_MM = 4;
const TITLE_ALLOWANCE_MM = TITLE_GAP_MM + 2 * TITLE_LINE_MM;

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
  const limit = printableArea(settings.paper, settings.orientation).height * PX_PER_MM;
  const blocks = [...sheet.children] as HTMLElement[];
  /*
   * The credit block is not packed with the rest. It belongs at the foot of the
   * last page — a licence notice on a page of its own is a wasted sheet, and one
   * floating half-way up a short last page reads as something that got left
   * behind. So it is set aside here and placed once the pages are known.
   */
  const credit = blocks.at(-1)?.classList.contains('ps-attribution') ? blocks.pop()! : null;

  const pages: number[] = [];
  const filled: number[] = [];
  let count = 0;
  let used = 0;

  const close = () => { pages.push(count); filled.push(used); count = 0; used = 0; };

  for (const block of blocks) {
    const box = outer(block);
    // A block that will not fit in what is left starts the page it needs.
    if (count > 0 && used + box.top + box.height > limit + FIT_TOLERANCE) close();
    count += 1;
    used += box.top + box.height + box.bottom;
    // A grid page is a page by construction, and "one sentence per page" says so.
    if (block.classList.contains('ps-grid') || block.classList.contains('ps-sentence--page')) {
      close();
    }
  }
  if (count > 0) close();
  if (pages.length === 0) { pages.push(0); filled.push(0); }

  if (credit) {
    const box = outer(credit);
    // Pinned to the foot of its page, so only its own height has to fit.
    if (filled[filled.length - 1]! + box.height > limit + FIT_TOLERANCE) pages.push(1);
    else pages[pages.length - 1]! += 1;
  }

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

export interface SheetOptions {
  sentences: Sentence[];
  /** Set for a Tafel, and then it decides the page; `sentences` are the cards on it. */
  board?: PrintBoard | null;
  settings: PrintSettings;
  provider: ProviderId;
  /** Mandatory for ARASAAC; printed at the foot of the output. */
  attribution: string | null;
  /** The METACOM notice, when the user has asked for it. */
  copyright: string | null;
  collectionName: string;
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
  | { kind: 'title'; text: string }
  | { kind: 'strip'; sentence: Sentence; page: boolean; framed: boolean }
  | { kind: 'row'; slots: Slot[] }
  | { kind: 'grid'; slots: Slot[]; cols: number; cellH: string; page: boolean }
  | { kind: 'tafel'; board: PrintBoard; cellH: string }
  | { kind: 'shopping-board'; zoneMm: number; cartW: number; cartH: number }
  | { kind: 'cut'; slots: Slot[] }
  | { kind: 'store'; slots: Slot[]; page: boolean }
  | { kind: 'credit'; lines: string[]; name: string };

/**
 * How many zones a block of the board holds, and how they are arranged.
 *
 * Fifteen and fifteen, in the shapes that fit beside each other on a landscape
 * sheet: a tall block to shop from, a wide one in the cart. Measured rather than
 * chosen — at 25 mm cards the two blocks come to 302 mm and the sheet is 277.
 */
export const SHOPPING = { list: { cols: 3, rows: 5 }, cart: { cols: 5, rows: 3 } };

/** The air a laminated card needs before it will go into a zone at all. */
const ZONE_AIR_MM = 3;
const ZONE_GAP_MM = 2;
/* What the cart reaches beyond its basket — handle up and out, wheels below —
   is in print.css as the margins around `.ps-cart` and the board's own gap.
   Kept there rather than here because it is room on the page, and the page is
   what that file is about. Change one and check the other. */

/** How many cards of an Einkaufsliste go on one sheet, cut or stored. */
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
  const { sentences, board, settings, provider, attribution, copyright, collectionName } = options;
  const credits = [attribution, copyright].filter((line): line is string => Boolean(line));
  const page = printableArea(settings.paper, settings.orientation);
  const blocks: Block[] = [];

  /*
   * Once, above everything, rather than per page: a header repeated on every
   * sheet would cost the grid its room on all of them, and what this answers is
   * "which collection is this printout" — a question a stack of paper asks once.
   */
  const title = settings.showCollectionTitle ? collectionName.trim() : '';
  if (title) blocks.push({ kind: 'title', text: title });

  const reserve = (credits.length > 0 ? creditAllowanceMm(credits.length) : 0)
    + (title ? TITLE_ALLOWANCE_MM : 0);

  if (board) {
    blocks.push({
      kind: 'tafel', board,
      cellH: `${((page.height - reserve) / board.rows).toFixed(3)}mm`,
    });
  } else if (settings.layout === 'einkaufsliste') {
    /* The zone in millimetres, which every part of this material is measured
       from — and which the cart has to be told, because its drawing *is* the
       block of zones and a hard-coded viewBox would stretch the moment somebody
       changes the card size. */
    const zoneMm = settings.symbolSizeMm + 2 * settings.cutMarginMm + ZONE_AIR_MM;
    blocks.push({
      kind: 'shopping-board',
      zoneMm,
      cartW: SHOPPING.cart.cols * zoneMm + (SHOPPING.cart.cols - 1) * ZONE_GAP_MM,
      cartH: SHOPPING.cart.rows * zoneMm + (SHOPPING.cart.rows - 1) * ZONE_GAP_MM,
    });
    const cards = deck(sentences, provider);
    for (const slots of chunks(cards, SHOPPING_PER_PAGE)) blocks.push({ kind: 'cut', slots });
    const stored = chunks(cards, SHOPPING_PER_PAGE);
    stored.forEach((slots, at) => blocks.push({ kind: 'store', slots, page: at < stored.length - 1 }));
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

  if (credits.length > 0) blocks.push({ kind: 'credit', lines: credits, name: collectionName });
  return blocks;
}
