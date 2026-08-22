import type { ProviderId, Sentence, Slot } from '../core/types.ts';
import { el } from './dom.ts';
import { icons } from './logo.ts';
import { symbolView, type SymbolView } from './symbols.ts';

const ORIGIN_HINT: Record<Slot['origin'], string> = {
  override: 'Aus deinem Wörterbuch',
  lemma: 'Grundform nachgeschlagen',
  separable: 'Trennbares Verb zusammengesetzt',
  compound: 'Zusammengesetztes Wort geteilt',
  synonym: 'Über ein Synonym gefunden',
  raw: 'Direkt gefunden',
  manual: 'Von Hand gewählt',
  unmatched: 'Kein Symbol gefunden',
};

export interface RowHandlers {
  onOpenSlot: (slotId: string) => void;
  onAddSlot: () => void;
  onReorder: (from: number, to: number) => void;
  onPrint: () => void;
  onDelete: () => void;
  onUnreadableSymbol?: (id: string) => void;
}

export interface RowView {
  node: HTMLElement;
  destroy(): void;
}

export function sentenceRow(
  sentence: Sentence,
  provider: ProviderId,
  handlers: RowHandlers,
): RowView {
  const views: SymbolView[] = [];
  let dragFrom: number | null = null;

  const slots = el('div', { class: 'slots' });

  sentence.slots.forEach((slot, index) => {
    const chosen = slot.choice[provider] ?? null;
    const candidates = slot.candidates[provider] ?? [];
    const symbolLabel = candidates.find((c) => c.id === chosen)?.label;

    const view = symbolView({
      provider,
      id: chosen,
      alt: slot.sourceToken,
      onUnreadable: handlers.onUnreadableSymbol,
    });
    views.push(view);

    const clearDrag = () => {
      dragFrom = null;
      for (const other of slots.children) {
        other.classList.remove('slot--dragging', 'slot--over-before', 'slot--over-after');
      }
    };

    const node = el('div', {
      class: `slot${chosen ? '' : ' slot--empty'}`,
      attrs: {
        role: 'button',
        tabindex: 0,
        draggable: 'true',
        title: `${ORIGIN_HINT[slot.origin]}${symbolLabel ? ` · ${symbolLabel}` : ''}\nZiehen zum Umsortieren`,
      },
      on: {
        click: () => handlers.onOpenSlot(slot.id),
        keydown: (event) => {
          // Alt+Arrow reorders without a mouse.
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
            if (to >= 0 && to < sentence.slots.length) handlers.onReorder(index, to);
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handlers.onOpenSlot(slot.id);
          }
        },
        dragstart: (event) => {
          dragFrom = index;
          node.classList.add('slot--dragging');
          event.dataTransfer?.setData('text/plain', String(index));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        },
        dragover: (event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          if (dragFrom === null || dragFrom === index) return;
          node.classList.toggle('slot--over-after', dragFrom < index);
          node.classList.toggle('slot--over-before', dragFrom > index);
        },
        dragleave: () => node.classList.remove('slot--over-before', 'slot--over-after'),
        drop: (event) => {
          event.preventDefault();
          const raw = event.dataTransfer?.getData('text/plain');
          const from = dragFrom ?? (raw ? Number(raw) : NaN);
          clearDrag();
          if (Number.isInteger(from) && from !== index) handlers.onReorder(from, index);
        },
        dragend: clearDrag,
      },
    },
      el('span', { class: 'slot__img' }, view.node),
      el('span', { class: 'slot__label', text: slot.sourceToken }),
    );

    slots.appendChild(node);
  });

  slots.appendChild(el('button', {
    class: 'slot-add', text: '+',
    attrs: { type: 'button', title: 'Feld hinzufügen' },
    on: { click: handlers.onAddSlot },
  }));

  const node = el('article', { class: 'row' },
    el('header', { class: 'row__head' },
      el('div', { class: 'row__text', text: sentence.rawInput }),
      el('div', { class: 'row__actions' },
        el('button', { class: 'btn btn--quiet btn--icon',
          attrs: { type: 'button', title: 'Diese Zeile drucken' },
          on: { click: handlers.onPrint } }, icons.printer()),
        el('button', { class: 'btn btn--danger btn--icon',
          attrs: { type: 'button', title: 'Diese Zeile löschen' },
          on: { click: handlers.onDelete } }, icons.trash()),
      ),
    ),
    slots,
  );

  return {
    node,
    destroy() {
      for (const view of views) view.destroy();
    },
  };
}
