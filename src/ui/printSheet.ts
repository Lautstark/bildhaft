import type {
  Orientation, PaperSize, PrintSettings, ProviderId, PunchEdge, Sentence, Slot, SongPartKind, ZoneStyle,
} from '../core/types.ts';
import { partOf, picturesOf, slotCaption, symbolIdFor } from '../core/types.ts';
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

/**
 * The margin a punched edge keeps: the holes sit 12 mm in and are 5.5 mm
 * across, so 20 mm leaves the punch clear of everything printed.
 */
export const PUNCH_MARGIN_MM = 20;

/** The four margins of a page, the punched edge's widened. */
export function pageMargins(punch: PunchEdge | null = null): { top: number; right: number; bottom: number; left: number } {
  return {
    top: punch === 'top' ? PUNCH_MARGIN_MM : PAGE_MARGIN_MM,
    right: PAGE_MARGIN_MM,
    bottom: PAGE_MARGIN_BOTTOM_MM,
    left: punch === 'left' ? PUNCH_MARGIN_MM : PAGE_MARGIN_MM,
  };
}

/** The area a page actually has for cards, once the margin is taken off. */
export function printableArea(
  paper: PaperSize, orientation: Orientation, punch: PunchEdge | null = null,
): { width: number; height: number } {
  const { width, height } = paperSize(paper, orientation);
  const m = pageMargins(punch);
  return { width: width - m.left - m.right, height: height - m.top - m.bottom };
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
 * Whether the page boxes carry the margin themselves, the paper none: when a
 * colour is set behind them, so it reaches the paper's edge, and when the
 * sheet is punched, so the hole marks can stand in the margin. The sheet and
 * the page rule ask this one question.
 */
export const bleeds = (settings: Pick<PrintSettings, 'pageColour' | 'punch'>): boolean =>
  settings.pageColour !== null || settings.punch !== null;

/**
 * `bleed`: pages on a colour of their own (`bleeds`). The paper then has no margin of its
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

/** What a page holds above its foot, in pixels: the notice and the number take the rest. */
function pageRoom(credit: HTMLElement | null, settings: PrintSettings): number {
  const foot = Math.max(
    credit ? outer(credit).top + outer(credit).height : 0,
    settings.showPageNumbers ? PAGE_NUMBER_MM * PX_PER_MM : 0,
  );
  return printableArea(settings.paper, settings.orientation, settings.punch).height * PX_PER_MM - foot;
}

/**
 * How many cards each line of a strip took — for the strips too tall for any
 * page, and null for every other.
 *
 * A strip is kept whole, so a sentence of twenty symbols at 50mm on A5 was one
 * block taller than its page: it ran out of its page box, over the next page
 * and under that page's cards, its foot with it. Such a strip is drawn again
 * in pieces of whole lines, which pages fill like any other blocks. One that
 * fits a page stays whole and moves to the next page instead, as before.
 *
 * Read the same way as `cardRows()`: cards on one line share an offsetTop.
 */
export function stripLines(sheet: HTMLElement, settings: PrintSettings): (number[] | null)[] {
  const credit = sheet.querySelector<HTMLElement>(':scope > .ps-attribution');
  const limit = pageRoom(credit, settings);
  return [...sheet.querySelectorAll<HTMLElement>(':scope > .ps-sentence')].map((strip) => {
    const box = outer(strip);
    if (box.top + box.height + box.bottom <= limit + FIT_TOLERANCE) return null;
    const lines: number[] = [];
    let top: number | null = null;
    for (const card of strip.querySelectorAll<HTMLElement>(':scope > .ps-row > .ps-card')) {
      if (card.offsetTop !== top) { lines.push(0); top = card.offsetTop; }
      lines[lines.length - 1]! += 1;
    }
    return lines.length > 1 ? lines : null;
  });
}

/**
 * How many of its groups each piece of a Lied's part takes — for the parts too
 * tall for a page, and null for every other.
 *
 * A part is one block, which a page never breaks inside, so a Strophe taller
 * than a page had nowhere to go: its ground ran past the page's foot and the
 * lines after it were cut off. Such a part is drawn again in pieces of whole
 * groups, each with the part's name over it: the first takes what is left of
 * the page it starts on, the next ones a page each. A part that fits a page
 * stays whole and moves to the next page, as before.
 *
 * What is left of a page is found by packing the blocks before it the way
 * planPages() will, so the first piece is cut to the room it will be given.
 * A group is the unit, never a line: a line sung „2×" goes with its bar.
 */
export function songPieces(sheet: HTMLElement, settings: PrintSettings): (number[] | null)[] | null {
  const blocks = [...sheet.children] as HTMLElement[];
  const credit = blocks.at(-1)?.classList.contains('ps-attribution') ? blocks.pop()! : null;
  const limit = pageRoom(credit, settings);
  const heading = blocks.find((block) => block.classList.contains('ps-title'));
  const headingBox = heading ? outer(heading) : null;
  const headingH = settings.titleEvery && headingBox ? headingBox.top + headingBox.height + headingBox.bottom : 0;
  const full = limit - headingH;

  const pieces: (number[] | null)[] = [];
  let pages = 0;
  let used = 0;
  const open = () => { pages += 1; used = pages > 1 ? headingH : 0; };
  open();
  for (const block of blocks) {
    const box = outer(block);
    const whole = box.top + box.height + box.bottom;
    const part = block.classList.contains('ps-song-part');
    if (!part || whole <= full + FIT_TOLERANCE) {
      if (part) pieces.push(null);
      if (used > (pages > 1 ? headingH : 0) && used + whole > limit + FIT_TOLERANCE) open();
      used += whole;
      continue;
    }
    /* The part's name and its ground's padding over every piece, its padding
       and margin under it: everything in the box that is not a group. */
    const groups = [...block.querySelectorAll<HTMLElement>(':scope > .ps-song-group')];
    const first = groups[0]!;
    const lastOne = groups.at(-1)!;
    const head = first.offsetTop - block.offsetTop;
    const tail = block.offsetTop + block.offsetHeight - (lastOne.offsetTop + lastOne.offsetHeight);
    const frame = box.top + head + tail + box.bottom;
    const counts: number[] = [];
    let from = 0;
    while (from < groups.length) {
      const top = groups[from]!.offsetTop;
      let to = from + 1;
      while (to < groups.length) {
        const next = groups[to]!;
        if (used + frame + next.offsetTop + next.offsetHeight - top > limit + FIT_TOLERANCE) break;
        to += 1;
      }
      /* Not even one group in what is left: the piece starts the next page. */
      const one = groups[from]!;
      if (to === from + 1 && used > (pages > 1 ? headingH : 0)
        && used + frame + one.offsetHeight > limit + FIT_TOLERANCE) {
        open();
        continue;
      }
      counts.push(to - from);
      const bottom = groups[to - 1]!;
      used += frame + bottom.offsetTop + bottom.offsetHeight - top;
      from = to;
      if (from < groups.length) open();
    }
    pieces.push(counts.length > 1 ? counts : null);
  }
  return pieces.some(Boolean) ? pieces : null;
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
  const limit = pageRoom(credit, settings);

  const pages: number[] = [];
  const filled: number[] = [];
  let count = 0;
  let used = 0;

  const close = () => { pages.push(count); filled.push(used); count = 0; used = 0; };

  /* A block that wants the name over its page — an Einkaufsliste's places,
     or any block when the title is asked for on every page — and starts a
     page without it gets it drawn there, so its room is kept. */
  const heading = blocks.find((block) => block.classList.contains('ps-title'));
  const headingBox = heading ? outer(heading) : null;
  const headingH = headingBox ? headingBox.top + headingBox.height + headingBox.bottom : 0;
  let previous: HTMLElement | null = null;

  for (const block of blocks) {
    const box = outer(block);
    // A block that will not fit in what is left starts the page it needs. Its
    // margin below counts: a page is a flex column, so the last block's margin
    // stays on the page rather than collapsing into the foot, and leaving it
    // out let a full page push its foot that much further down than the rest.
    const headed = block !== heading && (settings.titleEvery
      ? pages.length > 0
      : block.classList.contains('ps-titled') && previous !== heading);
    if (count > 0 && used + box.top + box.height + box.bottom > limit + FIT_TOLERANCE) close();
    if (count === 0 && headed) used += headingH;
    previous = block;
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

/** A Spiel's rows as they print: cell by cell, printed or left free. */
export interface PrintGame {
  rows: { zellen: { karte: Sentence; platz: boolean }[] }[];
}

export interface SheetOptions {
  sentences: Sentence[];
  /** Set for a Lied, and then it decides what is printed and in what order. */
  song?: PrintSong | null;
  /** Set for a Plauderbuch, and then it decides the pages. */
  talk?: PrintTalk | null;
  /** Set for a Spiel, and then it decides the Spielblatt and the Kartenbogen. */
  game?: PrintGame | null;
  /** Set for a Tafel, and then it decides the page; `sentences` are the cards on it. */
  board?: PrintBoard | null;
  settings: PrintSettings;
  provider: ProviderId;
  /** Mandatory for ARASAAC; printed at the foot of the output. */
  attribution: string | null;
  /** The METACOM notice, when the user has asked for it. */
  copyright: string | null;
  collectionName: string;
  /** The title's symbols, printed before it, in their order. */
  pictures?: Slot[];
}

/** The height a page sets aside for what is not the grid: credits, the Sammlung's name, the page number. */
export function reserveMm(
  settings: Pick<PrintSettings, 'paper' | 'orientation' | 'punch' | 'titleSizePt' | 'titleLine' | 'showPageNumbers'>,
  credits: string[], titled: Titled,
): number {
  return (credits.length > 0 ? creditAllowanceMm(credits, printableArea(settings.paper, settings.orientation, settings.punch).width) : 0)
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
  settings: Pick<PrintSettings, 'paper' | 'orientation' | 'punch' | 'showPageNumbers' | 'titleSizePt' | 'titleLine'>,
  grid: { cols: number; rows: number }, credits: string[], titled: Titled,
): { width: number; height: number } {
  const page = printableArea(settings.paper, settings.orientation, settings.punch);
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
  /* `pictures`: the title's symbols, printed before its words. */
  | { kind: 'title'; text: string; pictures: Slot[] }
  /* `slots`: the strip's cards, or one page's lines of a strip too tall for a
     page. Its sentence goes over the first piece and under the last. */
  | { kind: 'strip'; sentence: Sentence; slots: Slot[]; first: boolean; last: boolean; page: boolean; framed: boolean }
  | { kind: 'row'; slots: Slot[] }
  | { kind: 'grid'; slots: Slot[]; cols: number; cellH: string; page: boolean }
  | { kind: 'tafel'; board: PrintBoard; cellH: string }
  | { kind: 'shopping-board'; zoneMm: number; cartW: number; cartH: number; k: number }
  /* `guide`: the first sheet of cards says, under them, what the three sheets are for. */
  /* One row of cards to cut: a page holds as many rows as fit. `last` ends the cards. */
  | { kind: 'cut'; slots: Slot[]; last: boolean }
  /* A page of its own, before everything: what the sheets become, and how. */
  | { kind: 'shop-guide' }
  /* One row of the places: a page then holds as many rows as fit under the
     name, and the rest go on. `last` ends the places' sheet. */
  | { kind: 'store'; slots: Slot[]; last: boolean }
  | { kind: 'recipe-part'; part: 'zutat' | 'hilfsmittel'; slots: Slot[] }
  | { kind: 'recipe-step'; n: number; slots: Slot[]; first: boolean }
  /* `more`: a piece of a part too tall for a page after its first, named as
     going on. */
  | { kind: 'song-part'; part: SongPartKind; n: number; groups: { lines: Sentence[]; times: number }[]; more: boolean }
  | { kind: 'song-again' }
  | { kind: 'talk-page'; pictures: Slot[]; text: string; count: number; geo: TalkGeometry }
  | { kind: 'talk-cut'; slots: Slot[]; cols: number; geo: TalkGeometry }
  /* One sheet of a Spiel: each row its free cells' Ablage fields, then its
     cells in their own order — a printed card, or the field where one is
     laid, in the middle of a Muster as well as at its end. */
  | { kind: 'game-board'; rows: { cells: { slot: Slot; platz: boolean }[] }[]; lager: number; geo: GameGeometry }
  | { kind: 'game-cut'; slots: Slot[]; cols: number; geo: GameGeometry }
  | { kind: 'credit'; lines: string[] };

/**
 * A Plauderbuch page, measured: how big a field is, how many go across and
 * down, the cards cut for them, and the paper's factor everything else is
 * multiplied by.
 *
 * The page is laid out for A5 and grows with the paper — A4 by √2, A3 by 2 —
 * so the fields and the cards cut for them are bigger together, and a page
 * holds as many Antworten on every paper. Which way up it stands, and
 * whether the cards carry their word, decide the field's shape and how many
 * there are (talkShape): a card with only its picture is square, one with
 * its word under it stands upright. The fields take what the page has, the
 * band with the free field counted as one more row.
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
  /** A cut card, the laminate's seam taken off each side: laminated, it is the field again. */
  cutW: number;
  cutH: number;
  /** The picture inside a cut card, capped so the word keeps its lines. */
  symW: number;
}

/**
 * How a Plauderbuch page is divided: lying on its side four square fields
 * across and two down, or five upright ones with their word; standing up
 * three by three either way. The free field beside the question is the
 * same shape as the others — any card goes into it.
 */
export function talkShape(settings: Pick<PrintSettings, 'orientation' | 'showLabel'>): { cols: number; rows: number; aspect: number } {
  const aspect = settings.showLabel ? 3 / 4 : 1;
  if (settings.orientation === 'landscape') return settings.showLabel ? { cols: 5, rows: 2, aspect } : { cols: 4, rows: 2, aspect };
  return { cols: 3, rows: 3, aspect };
}

/** How many Antworten a page of a Plauderbuch prints; the rest wait in Bearbeiten. */
export const talkCapacity = (settings: Pick<PrintSettings, 'orientation' | 'showLabel'>): number => {
  const { cols, rows } = talkShape(settings);
  return cols * rows;
};

export const TALK_SCALE: Record<PaperSize, number> = { a5: 1, a4: Math.SQRT2, a3: 2 };

/**
 * A Spiel's sheet, measured: left the Ablage, right the rows — and every
 * cell has the same size, so everything stands on one line with its row.
 * The Ablage is a quiet block of all the game's fields, no echo of the
 * rows: it must not give away how the right side is filled. One game is
 * one sheet, always (the Tafel's reasoning: a game that needed a second
 * page would be two games). Every game has the one field, GAME_FIELD_MM, so
 * the cards of all of them are the same size; Bearbeiten adds no cell or
 * row the sheet has no room for (gameFits). Only a game built before that
 * limit, too full for the field, has it shrunk until its longest row fits.
 * Only the cutting sheet goes on to more paper; it is cut apart anyway.
 */
export interface GameGeometry {
  fieldW: number;
  fieldH: number;
  gap: number;
  /** The air round a card on the cutting sheet. */
  air: number;
  /** The paper's factor against A4, for the lengths that are not the field. */
  k: number;
  /** The page's height, the footer's and the title's room taken off. */
  height: number;
  /** The Ablage block's width: its columns, side by side. */
  lagerW: number;
  /** The Ablage block's columns: the cards shared over the game's rows. */
  lagerCols: number;
  /** The raster's rows, filled from the top by the Ablage and the game alike. */
  units: number;
  /** A cut card, the laminate's seam taken off each side: laminated, it is the field again. */
  cutW: number;
  cutH: number;
  /** The picture inside a printed card, capped so the word keeps its line. */
  symW: number;
}

/*
 * The field against A4's, per paper. A3 is A4 grown, and holds five rows of
 * seven at 1.4. A5 is not quite A4 shrunk: its margins, a punched edge, the
 * title and the footer keep their millimetres while the page loses a third,
 * so its field is a little smaller than 0.7 — 0.62, the largest that still
 * holds five rows of seven with all of them printed.
 */
export const GAME_SCALE: Record<PaperSize, number> = { a5: 0.62, a4: 1, a3: 1.4 };

/** A Spiel's field on A4, scaled with the paper like everything else on it. */
export const GAME_FIELD_MM = 30;

type GameSettings = Pick<PrintSettings, 'paper' | 'cutMarginMm' | 'showLabel' | 'labelSizePt' | 'punch'>;
type GameShape = { units: number; zellen: number; platz: number };

/** The air a Spiel keeps under its title, beyond the title's own margin. */
export const GAME_TITLE_AIR_MM = 4;

/**
 * What a Spiel's sheet keeps free of the game, counted tighter than a grid
 * page's reserve so five rows of 30 mm stand under each other whatever else
 * prints: the title one line (a Spiel's name is a short question, and the
 * sheet keeps it on one line), the air under it, and one footer line —
 * the credit and the page number share it, so the taller of the two.
 */
export function gameReserveMm(
  settings: Parameters<typeof reserveMm>[0], credits: string[], titled: Titled,
): number {
  const line = settings.titleSizePt * PT_MM * TITLE_LEADING;
  const title = !titled ? 0 : TITLE_GAP_MM + GAME_TITLE_AIR_MM
    + (titled === 'pictured' ? Math.max(line, titlePictureMm(settings.titleSizePt)) : line)
    + (settings.titleLine ? TITLE_RULE_GAP_MM + TITLE_RULE_MM : 0);
  const credit = credits.length > 0 ? creditAllowanceMm(credits, printableArea(settings.paper, settings.orientation, settings.punch).width) : 0;
  return title + Math.max(credit, settings.showPageNumbers ? PAGE_NUMBER_MM : 0);
}

/*
 * The sheet is one raster of rows: as many as the field leaves room for under
 * each other (a millimetre of slack, so a board measured at exactly the page's
 * height is not pushed to a page of its own) — five on A4. The Ablage and the
 * game both fill it column by column from the top, so a column is full before
 * the next begins and every dot of the Ablage stands level with a row. The
 * width is shared over the Ablage's and the game's cells (the 28 mm taken off
 * are the enclosures' padding and the fence with its step on either side —
 * 21 mm on a sheet punched at the left, whose fence stands closer, so a row
 * of six beside the Ablage still fits the narrower page;
 * every further column of the game brings its own padding and air). A game
 * the sheet cannot hold at the field — built before Bearbeiten kept to the
 * sheet, or a margin grown since, a punched edge, a credit line — takes the
 * raster that shrinks its field least, and that is nearly always more rows
 * under each other at a slightly smaller field rather than a second column
 * that would halve it.
 */
function gameRaster(settings: GameSettings, page: { width: number; height: number }, reserve: number, shape: GameShape) {
  const k = GAME_SCALE[settings.paper];
  const gap = 6 * k;
  const height = page.height - reserve;
  /* A row is a group: a soft ground round its cells, so its padding and the
     rows' own gap come off the height before the field takes its share. */
  const pad = 2 * k;
  const rowGap = 3 * k;
  const field = GAME_FIELD_MM * k;
  const zellen = Math.max(1, shape.zellen);
  const units = Math.max(1, shape.units);
  const measure = (reihen: number) => {
    const spielCols = Math.ceil(units / reihen);
    const lagerCols = Math.ceil(Math.max(1, shape.platz) / reihen);
    const fixed = (settings.punch === 'left' ? 21 : 28) * k + (spielCols - 1) * 13 * k;
    const gaps = (lagerCols - 1) * gap + spielCols * (zellen - 1) * gap;
    const wLimit = (page.width - fixed - gaps) / (lagerCols + spielCols * zellen);
    const hLimit = ((height - k - (reihen - 1) * rowGap) / reihen - 2 * pad) * (50 / 42);
    return { reihen, lagerCols, fieldW: Math.min(field, wLimit, hLimit) };
  };
  let best = measure(Math.max(1, Math.floor((height - k + rowGap) / (field * (42 / 50) + 2 * pad + rowGap) + 1e-9)));
  const fits = best.fieldW >= field - 1e-6;
  for (let reihen = best.reihen + 1; !fits && reihen <= units; reihen += 1) {
    const taller = measure(reihen);
    if (taller.fieldW > best.fieldW) best = taller;
  }
  return { k, gap, height, ...best, fits };
}

/** Whether a game of this shape fits its sheet at the one field size. */
export function gameFits(
  settings: GameSettings, page: { width: number; height: number }, reserve: number, shape: GameShape,
): boolean {
  return gameRaster(settings, page, reserve, shape).fits;
}

export function gameGeometry(
  settings: GameSettings, page: { width: number; height: number }, reserve: number, shape: GameShape,
): GameGeometry {
  const { k, gap, height, reihen, lagerCols, fieldW } = gameRaster(settings, page, reserve, shape);
  /* The air round a cut card is the margin, as everywhere. */
  const air = settings.cutMarginMm * k;
  const label = settings.showLabel ? settings.labelSizePt * 0.3528 * 1.4 + k : 0;
  const fieldH = fieldW * (42 / 50);
  /* A cut card is printed the laminate's seam smaller than the field — two
     millimetres a side, whatever the paper, because the seam is the pouch's
     and not the print's. Laminated, card and field are the one size again. */
  const cutW = Math.max(10, fieldW - 2 * LAMINATE_MM);
  const cutH = Math.max(10, fieldH - 2 * LAMINATE_MM);
  /* The picture takes what the smaller of the two boxes leaves it — the cut
     card's — so a symbol is the one size on the sheet and on the card, and
     the sheet says how big that is; nobody is asked. */
  const symW = Math.max(8, cutH - label - 3 * k);
  return {
    fieldW, fieldH, gap, air, k, height,
    lagerW: lagerCols * fieldW + (lagerCols - 1) * gap,
    lagerCols,
    units: reihen,
    cutW, cutH,
    symW,
  };
}

/** What the laminate seals beyond the paper's edge, each side. */
const LAMINATE_MM = 2;

export function talkGeometry(
  settings: Pick<PrintSettings, 'paper' | 'orientation' | 'showLabel' | 'labelSizePt' | 'cutMarginMm'>,
  page: { width: number; height: number }, reserve: number,
): TalkGeometry {
  const k = TALK_SCALE[settings.paper];
  const { cols, rows, aspect } = talkShape(settings);
  const gap = 6 * k;
  const air = 3 * k;
  const height = page.height - reserve;
  /* The band is a row of its own: a field tall, its padding round it. */
  const byHeight = (height - 2 * air - rows * gap) / (rows + 1);
  const byWidth = (page.width - (cols - 1) * gap) / cols / aspect;
  const cardH = Math.min(byHeight, byWidth);
  const cardW = cardH * aspect;
  /* As a Spiel's: printed the laminate's seam smaller than the field, so
     the laminated card is the field's size again. */
  const cutW = Math.max(10, cardW - 2 * LAMINATE_MM);
  const cutH = Math.max(10, cardH - 2 * LAMINATE_MM);
  /* Two lines for the word: an Antwort is often more than one. */
  const label = settings.showLabel ? 2 * settings.labelSizePt * 0.3528 * 1.15 + k : 0;
  const symW = Math.max(8, Math.min(cutW - 2 * k, cutH - label - 3 * k));
  return { cols, rows, cardW, cardH, gap, air: settings.cutMarginMm * k, k, height, cutW, cutH, symW };
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
export function sheetBlocks(
  options: SheetOptions, rows: number[] | null, strips: (number[] | null)[] | null = null,
  songs: (number[] | null)[] | null = null,
): Block[] {
  const { sentences, board, song, talk, game, settings, provider, attribution, copyright, collectionName } = options;
  const credits = creditLines(attribution, copyright);
  const page = printableArea(settings.paper, settings.orientation, settings.punch);
  const blocks: Block[] = [];

  /*
   * Once, above everything: what this answers is "which material is this
   * printout", a question a stack of paper usually asks once. Where the
   * template offers it, `titleEvery` asks it on every page, and the sheet
   * draws it again over each page after the first. An Einkaufsliste asks it
   * twice: its board and its places hang apart.
   */
  const title = settings.showCollectionTitle ? collectionName.trim() : '';
  /* The name as it stands in Bearbeiten: a Rezept's or a Tafel's with its
     picture, when it was given one. The picture goes and comes with the name.
     A Tafel's comes from outside, because its cards are only the placed ones. */
  const pictures = options.pictures ?? [];
  if (title) blocks.push({ kind: 'title', text: title, pictures });
  const titled: Titled = !title ? false : pictures.length > 0 ? 'pictured' : 'text';

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
    /* The guide on a page of its own, before everything, the name included;
       then the two sheets that stay, the board and the places, each under the
       name — every sheet of places, which planPages keeps room for and the
       sheet draws; the cards to cut last. */
    if (settings.showGuide) blocks.unshift({ kind: 'shop-guide' });
    const cards = deck(sentences, provider);
    if (title) blocks.push({ kind: 'title', text: title, pictures });
    /* As many places across as the page is wide; the place is its zone, and
       the air between two is the zones' own. */
    const zoneGap = ZONE_GAP_MM * k;
    const across = Math.max(1, Math.floor((page.width + zoneGap) / (zoneMm + zoneGap) + 1e-6));
    const rowsOf = chunks(cards, across);
    rowsOf.forEach((slots, at) => blocks.push({ kind: 'store', slots, last: at === rowsOf.length - 1 }));
    /* The cards edge to edge, their cutting margins touching: as many across
       as the page is wide, and as many rows as the page is tall, which
       planPages measures. */
    const cardMm = settings.symbolSizeMm + 2 * settings.cutMarginMm;
    const cutRows = chunks(cards, Math.max(1, Math.floor(page.width / cardMm + 1e-6)));
    cutRows.forEach((slots, at) => blocks.push({ kind: 'cut', slots, last: at === cutRows.length - 1 }));
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
     * in the middle of a line of song. Only a part too tall for any page goes
     * in pieces, whole groups each — see songPieces(). With „2×" asked for,
     * lines sung again straight after themselves are printed once; otherwise
     * every line is its own group of one, which is the song written out.
     */
    let drawn = 0;
    for (const part of song?.parts ?? []) {
      /* Asked for, a Refrain sung again is a reference to the one above. */
      if (settings.songRefrainOnce && part.kind === 'refrain' && !part.first) {
        blocks.push({ kind: 'song-again' });
        continue;
      }
      const groups = settings.songRepeats
        ? foldRepeats(part.lines)
        : part.lines.map((line) => ({ lines: [line], times: 1 }));
      const counts = songs?.[drawn] ?? [groups.length];
      drawn += 1;
      let taken = 0;
      counts.forEach((count, k) => {
        const last = k === counts.length - 1;
        blocks.push({
          kind: 'song-part', part: part.kind, n: part.n, more: k > 0,
          groups: last ? groups.slice(taken) : groups.slice(taken, taken + count),
        });
        taken += count;
      });
    }
  } else if (settings.layout === 'plauderbuch') {
    /*
     * A page of the book is a sheet of paper, always: the question on its
     * band with the free field beside it, the fields for the Aussagen below
     * — as many as the page holds (talkCapacity). More wait in Bearbeiten,
     * as the cards beside a Tafel do, and are not printed. Then the cards
     * for every field, to cut out and laminate.
     */
    const geo = talkGeometry(settings, page, reserve);
    const room = geo.cols * geo.rows;
    const shown = (talk?.pages ?? []).map((one) => ({ ...one, sayings: one.sayings.slice(0, room) }));
    for (const one of shown) {
      /* The question as its line stands in Bearbeiten: its symbols, then its
         words — a card made before questions had words of their own says
         its caption. */
      const first = one.question?.slots[0];
      const text = one.question?.rawInput || (first ? slotCaption(first) : '');
      blocks.push({ kind: 'talk-page', pictures: picturesOf(one.question), text, count: one.sayings.length, geo });
    }
    const cards = shown.flatMap((one) => one.sayings.flatMap((sentence) => sentence.slots.slice(0, 1)));
    if (cards.length > 0) {
      const cols = Math.max(1, Math.floor(page.width / (geo.cutW + 2 * geo.air) + 1e-6));
      const rows = Math.max(1, Math.floor(page.height / (geo.cutH + 2 * geo.air)));
      for (const slots of chunks(cards, cols * rows)) blocks.push({ kind: 'talk-cut', slots, cols, geo });
    }
  } else if (settings.layout === 'spiel') {
    /*
     * The Spielblatt first, one sheet per few rows: each row its fixed
     * pictures and a dashed Klett field per card to lay, and left of the
     * rows the Ablage — one quiet block of fields for every card of the
     * game, no echo of the rows, so the cut cards have a place to live
     * when the game is in the folder without counting out any answer. No
     * cutting line on it: the sheet is laminated whole. Then the
     * Kartenbogen, the cards at the fields' size with air round each for
     * the scissors.
     */
    /* A row still empty in Bearbeiten is being built, not designed: it does
       not print. */
    const rows = (game?.rows ?? []).map((row) => {
      const cells = row.zellen
        .map((zelle) => ({ slot: zelle.karte.slots[0], platz: zelle.platz }))
        .filter((cell): cell is { slot: Slot; platz: boolean } => Boolean(cell.slot));
      return { cells };
    }).filter((row) => row.cells.length > 0);
    const karten = rows.flatMap((row) => row.cells.filter((cell) => cell.platz).map((cell) => cell.slot));
    const geo = gameGeometry(settings, page, gameReserveMm(settings, credits, titled), {
      units: rows.length,
      zellen: Math.max(1, ...rows.map((row) => row.cells.length)),
      platz: Math.max(1, karten.length),
    });
    if (rows.length > 0) blocks.push({ kind: 'game-board', rows, lager: karten.length, geo });
    if (karten.length > 0) {
      const cols = Math.max(1, Math.floor(page.width / (geo.cutW + 2 * geo.air) + 1e-6));
      const cutRows = Math.max(1, Math.floor(page.height / (geo.cutH + 2 * geo.air)));
      for (const slots of chunks(karten, cols * cutRows)) blocks.push({ kind: 'game-cut', slots, cols, geo });
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
    /* Sentence strips: one row per sentence, in reading order. A strip the
       last paint found too tall for a page goes in pieces of whole lines —
       see stripLines(). */
    sentences.forEach((sentence, at) => {
      const lines = strips?.[at] ?? [sentence.slots.length];
      let taken = 0;
      lines.forEach((count, k) => {
        const last = k === lines.length - 1;
        blocks.push({
          kind: 'strip', sentence,
          slots: last ? sentence.slots.slice(taken) : sentence.slots.slice(taken, taken + count),
          first: k === 0, last,
          page: last && settings.onePerPage && at < sentences.length - 1,
          framed: settings.stripFrame,
        });
        taken += count;
      });
    });
  }

  if (credits.length > 0) blocks.push({ kind: 'credit', lines: credits });
  return blocks;
}
