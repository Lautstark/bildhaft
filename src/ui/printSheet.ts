import type {
  Orientation, PaperSize, PrintSettings, ProviderId, Sentence, Slot,
} from '../core/types.ts';
import { sentenceCaption, slotCaption } from '../core/types.ts';
import { el } from './dom.ts';
import { negationCross } from './logo.ts';
import { t } from '../i18n/index.ts';
import { peekSymbolUrl, resolveSymbolUrl, symbolIdFor } from './symbols.ts';

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
function framePadMm(settings: PrintSettings): number {
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
  const style = document.getElementById(PAGE_STYLE_ID)
    ?? document.head.appendChild(el('style', { attrs: { id: PAGE_STYLE_ID } }));
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
const BILDHAFT_URL = 'https://bildhaft.lautstark.tech';

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
  /** How many blocks each page holds, in order. One entry per page. */
  pages: number[];
}

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
 */
function cardRows(row: HTMLElement): number[] {
  const rows: number[] = [];
  let top: number | null = null;
  for (const card of row.querySelectorAll<HTMLElement>(':scope > .ps-card')) {
    if (card.offsetTop !== top) { rows.push(0); top = card.offsetTop; }
    rows[rows.length - 1]! += 1;
  }
  return rows;
}

/** The one flowing row of a card sheet, or null when the sheet has none. */
function flowingRow(sheet: HTMLElement): HTMLElement | null {
  return sheet.querySelector<HTMLElement>(':scope > .ps-row');
}

/**
 * Cuts that one row into one row per line of cards, so a page can hold whole
 * lines. Without it the only block a card sheet has is the row itself, and a
 * sheet of forty cards would be one indivisible block eight pages tall.
 */
function splitRow(sheet: HTMLElement, rows: number[]): void {
  const row = flowingRow(sheet);
  if (!row || rows.length < 2) return;
  /*
   * Idempotent, because it is asked twice of the same sheet: planPages() splits
   * the preview to measure it and applyPlan() is then run against both copies
   * from the one plan. Splitting an already-split sheet would take its first row
   * — one card — and cut that into as many rows as the whole sheet had.
   */
  if (sheet.querySelectorAll(':scope > .ps-row').length === rows.length) return;
  const cards = [...row.children];
  const made: HTMLElement[] = [];
  let taken = 0;
  for (const count of rows) {
    made.push(el('div', { class: 'ps-row' }, ...cards.slice(taken, taken + count)));
    taken += count;
  }
  if (taken < cards.length) made[made.length - 1]!.append(...cards.slice(taken));
  row.replaceWith(...made);
}

/** Sub-pixel slack, so a block that fits exactly is not pushed off the page. */
const FIT_TOLERANCE = 0.5;

export function planPages(sheet: HTMLElement, settings: PrintSettings): SheetPlan {
  const row = settings.layout === 'sheet' && settings.sheetFit !== 'grid'
    ? flowingRow(sheet) : null;
  const rows = row ? cardRows(row) : null;
  // Split before measuring: until it is, a card sheet's only block is the one
  // flowing row, which is as tall as every card it holds.
  if (rows) splitRow(sheet, rows);

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

  return { rows, pages };
}

/**
 * Puts a plan into a sheet: one `.ps-page` box per page, each exactly the
 * printable area. Run against both copies from the one plan, so the preview and
 * the printer cannot disagree about where a page ends.
 */
export function applyPlan(sheet: HTMLElement, plan: SheetPlan): void {
  if (plan.rows) splitRow(sheet, plan.rows);
  const blocks = [...sheet.children] as HTMLElement[];
  const pages: HTMLElement[] = [];
  let taken = 0;
  for (const count of plan.pages) {
    pages.push(el('div', { class: 'ps-page' }, ...blocks.slice(taken, taken + count)));
    taken += count;
  }
  // Cannot happen, and is checked anyway: a block the plan did not account for
  // would be a symbol silently missing from a printout.
  if (taken < blocks.length) pages[pages.length - 1]!.append(...blocks.slice(taken));
  sheet.replaceChildren(...pages);
  /*
   * Said in a class, because the preview draws a paginated sheet differently: the
   * paper's margin moves onto the page boxes. It cannot move before they exist —
   * planPages() measures how many cards fit across a row, and it has to measure
   * that inside the printable width, not inside the sheet with its margin taken
   * off it.
   */
  sheet.classList.add('ps-sheet--paged');
}

export interface SheetOptions {
  sentences: Sentence[];
  settings: PrintSettings;
  provider: ProviderId;
  /** Mandatory for ARASAAC; printed at the foot of the output. */
  attribution: string | null;
  /** The METACOM notice, when the user has asked for it. */
  copyright: string | null;
  collectionName: string;
}

/**
 * The printable document. Built twice: once inside the on-screen A4 preview and
 * once into #print-root, which @media print reveals. Both come from this one
 * function, so what the preview shows is what the printer produces.
 */
export function printSheet(options: SheetOptions): HTMLElement {
  const { sentences, settings, provider, attribution, copyright, collectionName } = options;

  const credits = [attribution, copyright].filter((line): line is string => Boolean(line));
  const page = printableArea(settings.paper, settings.orientation);

  const sheet = el('div', {
    class: `ps-sheet${settings.showCutLines ? ' ps-sheet--cutlines' : ''}`,
    style: {
      // Every printed size derives from these, so millimetres stay millimetres.
      '--sym': `${settings.symbolSizeMm}mm`,
      '--cut': `${settings.cutMarginMm}mm`,
      '--label': `${settings.labelSizePt}pt`,
      // The sheet sizes itself from these, so the paper is set in exactly one place.
      '--page-w': `${page.width}mm`,
      '--page-h': `${page.height}mm`,
      '--page-margin': `${PAGE_MARGIN_MM}mm`,
      '--frame-w': `${settings.cardBorderMm}mm`,
      '--frame-color': settings.cardBorderColor,
      '--frame-pad': `${framePadMm(settings)}mm`,
      '--card-radius': `${settings.cardRadiusMm}mm`,
      '--card-bg': settings.cardBackground ?? 'transparent',
      /*
       * The strip frame's own thickness. It follows the card frame when there
       * is one so both are drawn with the same pen, and falls back to a line
       * thin enough to cut along when card frames are off — which is the usual
       * case, since a strip frame is asked for on its own.
       */
      '--strip-w': `${settings.cardBorderMm > 0 ? settings.cardBorderMm : 0.5}mm`,
    },
  });

  /*
   * Once, above everything, rather than per page: a header repeated on every
   * sheet would cost the grid its room on all of them, and what this answers is
   * "which collection is this printout" — a question a stack of paper asks once.
   */
  const title = settings.showCollectionTitle ? collectionName.trim() : '';
  if (title) sheet.appendChild(el('h1', { class: 'ps-title', text: title }));

  if (settings.layout === 'sheet') {
    const reserve = (credits.length > 0 ? creditAllowanceMm(credits.length) : 0)
      + (title ? TITLE_ALLOWANCE_MM : 0);
    for (const node of cardSheet(sentences, settings, provider, reserve)) sheet.appendChild(node);
  } else {
    for (const node of strips(sentences, settings, provider)) sheet.appendChild(node);
  }

  if (credits.length > 0) {
    const lines: (string | Node)[] = [];
    for (const line of credits) {
      if (lines.length > 0) lines.push(el('br'));
      lines.push(line);
    }
    sheet.appendChild(el('p', { class: 'ps-attribution' },
      ...lines,
      /*
       * The name gives way, never the address. Both are on one line and a long
       * name would push the address off it, so the name is the part allowed to
       * be clipped — an ellipsis on a name the reader chose still says which
       * collection this is, where half a URL says nothing and is not something
       * anybody can type back in.
       */
      el('span', { class: 'ps-made' },
        el('span', { class: 'ps-made__name', text: collectionName }),
        el('span', { class: 'ps-made__tail' },
          ` · ${t('ui.made_with')} `,
          el('a', { class: 'ps-url', text: BILDHAFT_URL, attrs: { href: BILDHAFT_URL } })),
      ),
    ));
  }

  return sheet;
}

/** Sentence strips: one row per sentence, in reading order. */
function strips(sentences: Sentence[], settings: PrintSettings, provider: ProviderId): HTMLElement[] {
  return sentences.map((sentence, i) => el('div', {
    class: 'ps-sentence'
      + (settings.onePerPage && i < sentences.length - 1 ? ' ps-sentence--page' : '')
      + (settings.stripFrame ? ' ps-sentence--framed' : ''),
  },
    settings.showSentenceText ? el('p', { class: 'ps-caption', text: sentenceCaption(sentence) }) : null,
    el('div', { class: 'ps-row' }, ...sentence.slots.map((slot) => card(slot, settings, provider))),
  ));
}

/**
 * Card sheet: individual cards for cutting up and laminating.
 * Duplicates are collapsed — a deck needs one card per symbol, not one per use.
 *
 * Two ways to size them. By size, the cards keep their millimetres and flow.
 * By grid, the page is divided into exactly as many cells as were asked for and
 * the cards take whatever size that leaves — which is how boards are actually
 * specified, and the only way to fill a page edge to edge on purpose.
 */
function cardSheet(
  sentences: Sentence[], settings: PrintSettings, provider: ProviderId, reserveMm = 0,
): HTMLElement[] {
  const seen = new Set<string>();
  const cards: Slot[] = [];

  for (const sentence of sentences) {
    for (const slot of sentence.slots) {
      /*
       * A card is a symbol *and* the word under it, so both decide whether two
       * uses are the same card. Keying on the symbol alone printed one card for
       * a symbol whose caption had been rewritten in one sentence and not the
       * other, and silently dropped whichever wording came second.
       */
      const id = symbolIdFor(slot, provider);
      const key = `${id ?? 'blank'}|${slotCaption(slot).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(slot);
    }
  }

  if (settings.sheetFit !== 'grid') {
    return [el('div', { class: 'ps-row' }, ...cards.map((slot) => card(slot, settings, provider)))];
  }

  const cols = Math.max(1, Math.round(settings.gridCols));
  const rows = Math.max(1, Math.round(settings.gridRows));
  const perPage = cols * rows;
  const page = printableArea(settings.paper, settings.orientation);

  /*
   * Pages are cut here rather than left to the browser. Letting a single grid
   * paginate itself puts a row wherever the break happens to fall, so the same
   * board printed twice can come out with different rows on each sheet — fatal
   * for material that is meant to be cut into a fixed set of cards.
   */
  const pages: HTMLElement[] = [];
  for (let start = 0; start < Math.max(cards.length, 1); start += perPage) {
    const chunk = cards.slice(start, start + perPage);
    const last = start + perPage >= cards.length;
    pages.push(el('div', {
      class: `ps-grid${last ? '' : ' ps-grid--page'}`,
      style: {
        '--cols': String(cols),
        '--cell-h': `${((page.height - reserveMm) / rows).toFixed(3)}mm`,
      },
    }, ...chunk.map((slot) => card(slot, settings, provider, true))));
  }
  return pages;
}

/** Whether anything is asked for that has to be drawn around the symbol. */
function isFramed(settings: PrintSettings): boolean {
  return settings.cardBorderMm > 0 || settings.cardBackground !== null;
}

function card(
  slot: Slot, settings: PrintSettings, provider: ProviderId, fill = false,
): HTMLElement {
  const id = symbolIdFor(slot, provider);
  const label = slotCaption(slot);
  const box = el('div', { class: 'ps-card__img' });

  /*
   * The cross is re-laid every time the box's contents change, because they do
   * change: a symbol that resolves late replaces whatever stood in for it, and
   * a cross merely appended once would go with it.
   */
  const cross = slot.negated ? negationCross() : null;
  const put = (node: Node) => box.replaceChildren(...(cross ? [node, cross] : [node]));

  const blank = () => put(el('div', { class: 'ps-card__blank' }));

  const show = (url: string) => put(el('img', {
    // alt is empty on purpose: a broken image would otherwise print its alt text
    // inside the card, duplicating the label below it.
    attrs: { src: url, alt: '' },
    on: { error: blank },
  }));

  const known = id ? peekSymbolUrl(provider, id) : null;
  if (known) show(known);
  else {
    blank();
    if (id) resolveSymbolUrl(provider, id).then((url) => { if (url) show(url); });
  }

  const contents = [
    box,
    settings.showLabel ? el('div', { class: 'ps-card__label', text: label }) : null,
  ];

  /*
   * The frame is a real element rather than a border on the card, because the
   * card's edge is the cut line: a border there would be cut through. It is
   * also only built when something asks for it, which is what keeps an
   * unframed card exactly the size it has always been.
   */
  const framed = isFramed(settings);

  return el('div', { class: `ps-card${settings.labelPosition === 'above' ? ' ps-card--label-above' : ''}`
      + (fill ? ' ps-card--fill' : '') + (framed ? ' ps-card--framed' : '') },
    ...(framed ? [el('div', { class: 'ps-card__frame' }, ...contents)] : contents),
  );
}
