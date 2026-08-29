import type { ProviderId, Sentence, Slot } from '../core/types.ts';
import { slotCaption } from '../core/types.ts';
import { renameField } from '@lautstark/design/rename';
import { el } from './dom.ts';
import { icons, negationCross } from './logo.ts';
import { symbolIdFor, symbolView, type SymbolView } from './symbols.ts';
import { t } from '../i18n/index.ts';

/* Why this symbol and not another one - the sentence under a slot.
 *
 * Every rung both pipelines have, which is more than either language uses:
 * `separable`, `compound` and `synonym` only ever come back from German, and
 * `phrasal` only from English. Keeping the ones that cannot happen costs a
 * table entry and means a slot restored from a collection built in the other
 * language still explains itself. */
const originHint = (origin: Slot['origin']): string => t(`ui.origin_${origin}`);

export interface RowHandlers {
  onOpenSlot: (slotId: string) => void;
  onAddSlot: () => void;
  onReorder: (from: number, to: number) => void;
  onPrint: () => void;
  onDelete: () => void;
  /** The field's raw value: untrimmed, and empty for "back to the typed line". */
  onRename: (title: string) => void;
  onUnreadableSymbol?: (id: string) => void;
}

export interface RowView {
  node: HTMLElement;
  /**
   * Take a renamed record without being rebuilt.
   *
   * The one change to a sentence that draws the same row, and the one where
   * rebuilding would be felt: the name is typed into the row itself, so a
   * repaint that replaced the row would take the field out from under the
   * person typing in it. What lands here goes through the bound field's
   * `refresh`, which knows when the field is the better authority.
   */
  rename(sentence: Sentence): void;
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
    const chosen = symbolIdFor(slot, provider);
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
        /* A rewritten caption is named in full here, because the tile clips it
           to one line and the paper does not. */
        title: `${slot.ownImage ? t('ui.own_picture') : originHint(slot.origin)}${symbolLabel ? ` · ${symbolLabel}` : ''}${slot.negated ? ` · ${t('ui.crossed_out')}` : ''}${slot.label?.trim() ? `\n${t('ui.text_label_value', { text: slot.label.trim() })}` : ''}\n${t('ui.drag_to_reorder')}`,
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
      el('span', { class: 'slot__img' }, view.node, slot.negated ? negationCross() : null),
      el('span', { class: 'slot__label', text: slotCaption(slot) }),
    );

    slots.appendChild(node);
  });

  slots.appendChild(el('button', {
    class: 'slot-add', text: '+',
    attrs: { type: 'button', title: t('ui.add_slot') },
    on: { click: handlers.onAddSlot },
  }));

  /**
   * The line at the head of the row is the field that names it — conventions.md
   * §1.6's answer for a Sammlung, one level down, rather than a second way of
   * spelling the same question. There is no dialog and nothing to open: the
   * name *is* the input, and .row__title draws it as a line until it is
   * hovered.
   *
   * Empty means unnamed, so the field shows the typed line as a placeholder and
   * holds only a name that was actually given. The same reading the caption
   * field in the picker has, so clearing works the same way in both.
   */
  const titleInput = el('input', {
    class: 'row__title',
    attrs: { type: 'text', maxlength: 80, 'aria-label': t('ui.row_name'),
      placeholder: sentence.rawInput },
  });
  titleInput.value = sentence.title?.trim() ?? '';

  /* A named row still says what was typed, because those are the words the
     symbols were fetched with and the ones a search finds it by — and the
     placeholder that was showing them is gone the moment there is a name.
     Nowhere but here: the paper prints the name alone. */
  const showTyped = (of: Sentence): void => {
    if (of.title?.trim()) titleInput.title = t('ui.typed_line', { text: of.rawInput });
    else titleInput.removeAttribute('title');
  };
  showTyped(sentence);

  /* Debounced while typing, written on blur and on Enter, and not written when
     the value has not moved. @lautstark/design/rename holds that timing for all
     three products; what is left here is what the field looks like and what an
     empty one means. */
  const naming = renameField(titleInput, (typed) => handlers.onRename(typed));

  const head = el('header', { class: 'row__head' },
    titleInput,
    el('div', { class: 'row__actions' },
      el('button', { class: 'btn quiet icon',
        attrs: { type: 'button', title: t('ui.print_row') },
        on: { click: handlers.onPrint } }, icons.printer()),
      el('button', { class: 'btn destructive icon',
        attrs: { type: 'button', title: t('ui.delete_row') },
        on: { click: handlers.onDelete } }, icons.trash()),
    ),
  );

  const node = el('article', { class: 'row' }, head, slots);

  return {
    node,
    rename(next) {
      naming.refresh(next.title?.trim() ?? '');
      showTyped(next);
    },
    destroy() {
      naming.stop();
      for (const view of views) view.destroy();
    },
  };
}
