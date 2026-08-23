import type { PrintSettings, ProviderId, Sentence, Slot } from '../core/types.ts';
import { el } from './dom.ts';
import { peekSymbolUrl, resolveSymbolUrl, symbolIdFor } from './symbols.ts';

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

  const sheet = el('div', {
    class: `ps-sheet${settings.showCutLines ? ' ps-sheet--cutlines' : ''}`,
    style: {
      // Every printed size derives from these, so millimetres stay millimetres.
      '--sym': `${settings.symbolSizeMm}mm`,
      '--cut': `${settings.cutMarginMm}mm`,
      '--label': `${settings.labelSizePt}pt`,
    },
  });

  if (settings.layout === 'sheet') sheet.appendChild(cardSheet(sentences, settings, provider));
  else for (const node of strips(sentences, settings, provider)) sheet.appendChild(node);

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
 * Card sheet: a grid of individual cards for cutting up and laminating.
 * Duplicates are collapsed — a deck needs one card per symbol, not one per use.
 */
function cardSheet(sentences: Sentence[], settings: PrintSettings, provider: ProviderId): HTMLElement {
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

  return el('div', { class: 'ps-row' }, ...cards.map((slot) => card(slot, settings, provider)));
}

function card(slot: Slot, settings: PrintSettings, provider: ProviderId): HTMLElement {
  const id = symbolIdFor(slot, provider);
  const label = slot.sourceToken || slot.concept;
  const box = el('div', { class: 'ps-card__img' });

  const blank = () => box.replaceChildren(el('div', { class: 'ps-card__blank' }));

  const show = (url: string) => box.replaceChildren(el('img', {
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

  return el('div', { class: `ps-card${settings.labelPosition === 'above' ? ' ps-card--label-above' : ''}` },
    box,
    settings.showLabel ? el('div', { class: 'ps-card__label', text: label }) : null,
  );
}
