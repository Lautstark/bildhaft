import type { Orientation, PrintSettings, ProviderId, Sentence, Slot } from '../core/types.ts';
import { el } from './dom.ts';
import { negationCross } from './logo.ts';
import { peekSymbolUrl, resolveSymbolUrl, symbolIdFor } from './symbols.ts';

/** A4, and the margin @page reserves. Millimetres, because the sheet is. */
const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;
const PAGE_MARGIN_MM = 10;

/** The area a page actually has for cards, once the margin is taken off. */
export function printableArea(orientation: Orientation): { width: number; height: number } {
  const landscape = orientation === 'landscape';
  return {
    width: (landscape ? A4_LONG_MM : A4_SHORT_MM) - 2 * PAGE_MARGIN_MM,
    height: (landscape ? A4_SHORT_MM : A4_LONG_MM) - 2 * PAGE_MARGIN_MM,
  };
}

/*
 * @page cannot be written from a class or read a custom property, so the one
 * rule that decides which way the paper goes has to be a stylesheet of its own.
 * Kept as a single element that is rewritten rather than added to, so repeated
 * paints cannot stack up conflicting page rules.
 */
const PAGE_STYLE_ID = 'print-page-setup';

export function applyPageSetup(orientation: Orientation): void {
  const style = document.getElementById(PAGE_STYLE_ID)
    ?? document.head.appendChild(el('style', { attrs: { id: PAGE_STYLE_ID } }));
  style.textContent = `@page { size: A4 ${orientation}; margin: ${PAGE_MARGIN_MM}mm; }`;
}

/** Puts the paper back to the stylesheet's default when the dialog goes away. */
export function clearPageSetup(): void {
  document.getElementById(PAGE_STYLE_ID)?.remove();
}

export interface SheetOptions {
  sentences: Sentence[];
  settings: PrintSettings;
  provider: ProviderId;
  /** Mandatory for ARASAAC; printed at the foot of the output. */
  attribution: string | null;
  collectionName: string;
}

/**
 * The printable document. Built twice: once inside the on-screen A4 preview and
 * once into #print-root, which @media print reveals. Both come from this one
 * function, so what the preview shows is what the printer produces.
 */
export function printSheet(options: SheetOptions): HTMLElement {
  const { sentences, settings, provider, attribution, collectionName } = options;

  const page = printableArea(settings.orientation);

  const sheet = el('div', {
    class: `ps-sheet${settings.showCutLines ? ' ps-sheet--cutlines' : ''}`
      + (settings.orientation === 'landscape' ? ' ps-sheet--landscape' : ''),
    style: {
      // Every printed size derives from these, so millimetres stay millimetres.
      '--sym': `${settings.symbolSizeMm}mm`,
      '--cut': `${settings.cutMarginMm}mm`,
      '--label': `${settings.labelSizePt}pt`,
      '--page-w': `${page.width}mm`,
      '--page-h': `${page.height}mm`,
    },
  });

  if (settings.layout === 'sheet') {
    for (const node of cardSheet(sentences, settings, provider)) sheet.appendChild(node);
  } else {
    for (const node of strips(sentences, settings, provider)) sheet.appendChild(node);
  }

  if (attribution) {
    sheet.appendChild(el('p', { class: 'ps-attribution' },
      attribution,
      el('br'),
      `${collectionName} · erstellt mit bildhaft`,
    ));
  }

  return sheet;
}

/** Sentence strips: one row per sentence, in reading order. */
function strips(sentences: Sentence[], settings: PrintSettings, provider: ProviderId): HTMLElement[] {
  return sentences.map((sentence, i) => el('div', {
    class: `ps-sentence${settings.onePerPage && i < sentences.length - 1 ? ' ps-sentence--page' : ''}`,
  },
    settings.showSentenceText ? el('p', { class: 'ps-caption', text: sentence.rawInput }) : null,
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
  sentences: Sentence[], settings: PrintSettings, provider: ProviderId,
): HTMLElement[] {
  const seen = new Set<string>();
  const cards: Slot[] = [];

  for (const sentence of sentences) {
    for (const slot of sentence.slots) {
      const id = symbolIdFor(slot, provider);
      const key = id ?? `blank:${slot.sourceToken.toLowerCase()}`;
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
  const page = printableArea(settings.orientation);

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
        '--cell-h': `${(page.height / rows).toFixed(3)}mm`,
      },
    }, ...chunk.map((slot) => card(slot, settings, provider, true))));
  }
  return pages;
}

function card(
  slot: Slot, settings: PrintSettings, provider: ProviderId, fill = false,
): HTMLElement {
  const id = symbolIdFor(slot, provider);
  const label = slot.sourceToken || slot.concept;
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

  return el('div', { class: `ps-card${settings.labelPosition === 'above' ? ' ps-card--label-above' : ''}`
      + (fill ? ' ps-card--fill' : '') },
    box,
    settings.showLabel ? el('div', { class: 'ps-card__label', text: label }) : null,
  );
}
