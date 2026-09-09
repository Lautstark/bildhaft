/**
 * A card in a Wortkarten-Sammlung: one symbol, and the text that goes with it.
 *
 * The row a Satzstreifen-Sammlung draws is `row.ts`, and this is deliberately
 * not a variant of it. A row is a sentence — a title, a strip of slots in an
 * order somebody dragged, a „+" for the next word — and none of that is true of
 * a card, which holds exactly one thing and is going to be cut out. Sharing one
 * component between them would mean a component whose every part is optional.
 *
 * What it does share is the wall the Wortschatz draws, down to the class names:
 * a card is a card whether the word is the household's or this Sammlung's.
 */

import type { CollectionKind, ProviderId, Sentence } from '../core/types.ts';
import { slotCaption, symbolIdFor } from '../core/types.ts';
import { el } from './dom.ts';
import { symbolView, type SymbolView } from './symbols.ts';
import { t } from '../i18n/index.ts';

export interface WordCardHandlers {
  onOpenSlot: (slotId: string) => void;
  onDelete: () => void;
  onUnreadableSymbol: (id: string) => void;
}

export interface WordCardView {
  node: HTMLElement;
  destroy(): void;
}

export function wordCard(
  sentence: Sentence, provider: ProviderId, handlers: WordCardHandlers,
): WordCardView {
  const slot = sentence.slots[0];
  const caption = slot ? slotCaption(slot) : '';
  const views: SymbolView[] = [];

  /* A card whose slot was never filled — made by the „+" tile, or typed as a
     word the source had nothing for. Dashed and asking, which is the same thing
     an unresolved slot says in a row. */
  const shown = slot ? symbolIdFor(slot, provider) : null;
  const picture = shown
    ? (() => {
      const view = symbolView({
        provider,
        id: shown,
        alt: caption,
        onUnreadable: handlers.onUnreadableSymbol,
      });
      views.push(view);
      return el('button', {
        class: 'word__pic',
        attrs: { type: 'button', 'aria-label': t('ui.change_picture_for', { word: caption }) },
        on: { click: () => slot && handlers.onOpenSlot(slot.id) },
      }, view.node);
    })()
    : el('button', {
      class: 'word__pic word__pic--asking', text: '?',
      attrs: { type: 'button', 'aria-label': t('ui.pick_picture_for', { word: caption || '…' }) },
      on: { click: () => slot && handlers.onOpenSlot(slot.id) },
    });

  const node = el('div', { class: 'word' },
    picture,
    el('button', {
      class: 'word__drop', text: '×',
      attrs: { type: 'button', 'aria-label': t('ui.delete_card', { word: caption || '…' }) },
      on: { click: handlers.onDelete },
    }),
    el('b', { class: 'word__name', text: caption }),
  );

  return { node, destroy: () => { for (const view of views.splice(0)) view.destroy(); } };
}

/**
 * The two templates, as something to look at rather than to read.
 *
 * A drawing rather than a word because the choice is about what comes out of
 * the printer: a strip with symbols in a row, or a sheet of cards with the cut
 * lines between them. The dashed lines are the whole argument — they say
 * without a sentence that this paper gets cut up and the other one does not.
 */
export function templateArt(kind: CollectionKind): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 132 46');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'tpl__art');

  const add = (tag: string, attrs: Record<string, string | number>) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    svg.append(node);
  };

  if (kind === 'satzstreifen') {
    add('rect', { class: 'tpl__ink', x: 4, y: 9, width: 124, height: 28, rx: 4 });
    for (let i = 0; i < 4; i += 1) {
      add('rect', { class: 'tpl__fill', x: 12 + i * 20, y: 16, width: 14, height: 14, rx: 2 });
    }
    return svg;
  }

  /* Three sheets that only mean anything together, so the tile draws all three:
     the board with its cart, the cards to cut, and the sheet they live on. */
  if (kind === 'einkaufsliste') {
    add('rect', { class: 'tpl__ink', x: 3, y: 8, width: 40, height: 30, rx: 3 });
    add('path', { class: 'tpl__ink', d: 'M23 14 h16 v12 h-16 z' });
    add('path', { class: 'tpl__ink', d: 'M23 14 l-4 -4' });
    add('circle', { class: 'tpl__ink', cx: 27, cy: 29, r: 2 });
    add('circle', { class: 'tpl__ink', cx: 36, cy: 29, r: 2 });
    for (let i = 0; i < 3; i += 1) add('rect', { class: 'tpl__fill', x: 7, y: 12 + i * 8, width: 6, height: 6, rx: 1 });
    for (let col = 0; col < 2; col += 1) {
      for (let row = 0; row < 3; row += 1) {
        add('rect', { class: 'tpl__ink', x: 54 + col * 14, y: 8 + row * 11, width: 11, height: 8, rx: 2 });
      }
    }
    add('line', { class: 'tpl__cut', x1: 51, y1: 6, x2: 51, y2: 42 });
    add('line', { class: 'tpl__cut', x1: 84, y1: 6, x2: 84, y2: 42 });
    for (let col = 0; col < 3; col += 1) {
      for (let row = 0; row < 3; row += 1) {
        add('rect', { class: 'tpl__ink', x: 92 + col * 13, y: 8 + row * 11, width: 10, height: 6, rx: 1 });
        add('rect', { class: 'tpl__fill', x: 92 + col * 13, y: 15 + row * 11, width: 7, height: 2, rx: 1 });
      }
    }
    return svg;
  }

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      add('rect', {
        class: 'tpl__ink', x: 10 + col * 33, y: 5 + row * 21, width: 26, height: 16, rx: 3,
      });
    }
  }
  add('line', { class: 'tpl__cut', x1: 39.5, y1: 2, x2: 39.5, y2: 45 });
  add('line', { class: 'tpl__cut', x1: 72.5, y1: 2, x2: 72.5, y2: 45 });
  add('line', { class: 'tpl__cut', x1: 6, y1: 23.5, x2: 112, y2: 23.5 });
  return svg;
}
