<script lang="ts">
  import type { ProviderId, Sentence, Slot } from '../core/types.ts';
  import { slotCaption } from '../core/types.ts';
  import TitleField from '@lautstark/design/svelte/TitleField';
  import Icon from '../pieces/Icon.svelte';
  import CardFace from './CardFace.svelte';
  import { symbolIdFor } from '../ui/symbols.ts';
  import { confirmDeleteSentence, handleAddSlot, handleRename, handleReorder, openPicker } from '../app/editing.ts';
  import { t } from '../i18n/index.ts';

  /* `step` is set when the row is one of a Rezept's Schritte: it is numbered.
     No row has a printer of its own any more: everything prints from the
     sheet column beside the Sammlung. */
  let { sentence, provider, step, sung, onGrab }: {
    sentence: Sentence; provider: ProviderId; step?: number;
    /* A Rezept's Schritte are put in order by dragging: the number is what
       is taken hold of, and the Rezept moves the row. */
    onGrab?: (event: DragEvent) => void;
    /* Set when the row is a line of a Lied: how often it is sung there. A
       line sung more than once says so, because changing it here changes it
       everywhere it is sung — which is the point, and a surprise if unsaid. */
    sung?: number;
  } = $props();

  /* Why this symbol and not another one - the sentence under a slot.
   *
   * Every rung both pipelines have, which is more than either language uses:
   * `separable`, `compound` and `synonym` only ever come back from German, and
   * `phrasal` only from English. Keeping the ones that cannot happen costs a
   * table entry and means a slot restored from a collection built in the other
   * language still explains itself. */
  const originHint = (origin: Slot['origin']): string => t(`ui.origin_${origin}`);

  const tooltip = (slot: Slot, symbolLabel: string | undefined): string =>
    `${slot.ownImage ? t('ui.own_picture') : originHint(slot.origin)}`
    + `${symbolLabel ? ` · ${symbolLabel}` : ''}`
    + `${slot.negated ? ` · ${t('ui.crossed_out')}` : ''}`
    + `${slot.mirrored ? ` · ${t('ui.mirrored')}` : ''}`
    /* A rewritten caption is named in full here, because the tile clips it
       to one line and the paper does not. */
    + `${slot.label?.trim() ? `\n${t('ui.text_label_value', { text: slot.label.trim() })}` : ''}`
    + `\n${t('ui.drag_to_reorder')}`;

  const labelOf = (slot: Slot): string | undefined =>
    (slot.candidates[provider] ?? []).find((c) => c.id === symbolIdFor(slot, provider))?.label;

  /* Which slot is being dragged, and what the slots under the pointer are
     marked with. Two runes rather than classes written onto nodes by hand:
     what a class says about a node is what the markup says about it. */
  let dragFrom = $state<number | null>(null);
  let over = $state<number | null>(null);

  function clearDrag(): void { dragFrom = null; over = null; }

  function slotKeys(event: KeyboardEvent, index: number): void {
    // Alt+Arrow reorders without a mouse.
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (to >= 0 && to < sentence.slots.length) void handleReorder(sentence.id, index, to);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker(sentence.id, sentence.slots[index]!.id);
    }
  }

  function dragStart(event: DragEvent, index: number): void {
    dragFrom = index;
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /* A row takes only its own slots. A symbol dragged out of another row
     carries a place in *that* row, and read as one in this one it moved the
     wrong slot — or, past the end, wrote an empty one that stopped the whole
     Material from drawing. So the drop is refused, and the pointer says so. */
  function dragOver(event: DragEvent, index: number): void {
    if (dragFrom === null) { if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'; return; }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (dragFrom === index) return;
    over = index;
  }

  function drop(event: DragEvent, index: number): void {
    const from = dragFrom;
    clearDrag();
    if (from === null) return;
    event.preventDefault();
    if (from !== index) void handleReorder(sentence.id, from, index);
  }

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
   *
   * `@lautstark/design/svelte/TitleField` since design v1.40.0, which makes
   * this the last of bildhaft's three rename fields to be the shared one — and
   * it is the shared one on the second attempt rather than the first. The
   * closing round left this field written out, because the component carried
   * no `maxlength` and no `title` and took no rest props: adopting would have
   * dropped both without saying so, and two cases in e2e/rowname.spec.ts read
   * that title, one for its text under a named row and one for its absence
   * under an unnamed one. Declining and reporting it is why v1.39.0 gave the
   * component the attributes a field carries, with the eight it owns excluded
   * from the type so no caller can take `class` or `aria-label` off it while
   * reaching for `maxlength`. Both now arrive as rest props.
   *
   * `class="row__title"` because this field is not `.title-input` — §6.5 made
   * `class` a prop for exactly this, and the rule that draws it a line until
   * it is hovered is this product's, at the row's size rather than the work
   * head's.
   *
   * The debounce, the write on the way out, the refusal to write a value that
   * has not moved and the guard against a repaint typing over somebody are all
   * `@lautstark/design/rename`'s and always were. What leaves with this change
   * is bildhaft's own copy of the wiring around them — and with it the last
   * trace of the effect that used to assign `titleInput.value` directly, which
   * was the bug `rename.js` exists to remove arriving by the back door: the
   * assignment read `sentence.title`, so the effect re-ran on every write and
   * stopped the binding mid-word. The component reaches the field through
   * `refresh()` and nothing else.
   *
   * No `oninput`: nothing outside this row echoes a sentence's name while it is
   * being typed. No `caret` either — a row is made by translating, not by a
   * „+ Neu" button that owes the new thing a caret.
   */

  /* A named row still says what was typed, because those are the words the
     symbols were fetched with and the ones a search finds it by — and the
     placeholder that was showing them is gone the moment there is a name.
     Nowhere but here: the paper prints the name alone. */
  let typedLine = $derived(sentence.title?.trim() ? t('ui.typed_line', { text: sentence.rawInput }) : null);
</script>

<article class="row" aria-label={sentence.rawInput}><header class="row__head">{#if step !== undefined}<span class="row__step" class:row__step--grip={onGrab} aria-hidden="true" draggable={onGrab ? 'true' : undefined} title={onGrab ? t('ui.drag_to_reorder') : undefined} ondragstart={onGrab}>{step}</span>{/if}<TitleField value={sentence.title?.trim() ?? ''} write={(typed) => void handleRename(sentence.id, typed)} class="row__title" maxlength={80} label={t('ui.row_name')} placeholder={sentence.rawInput} title={typedLine} />{#if sung !== undefined && sung > 1}<span class="row__sung" title={t('ui.song_sung_title', { n: sung })}><Icon name="link" />{t('ui.song_sung', { n: sung })}</span>{/if}<div class="row__actions"><button class="btn destructive icon" type="button" title={t('ui.delete_row')} onclick={() => void confirmDeleteSentence(sentence)}><Icon name="trash" /></button></div></header><div class="slots">{#each sentence.slots as slot, index (slot.id)}<div
  class="slot"
  class:slot--empty={!symbolIdFor(slot, provider)}
  class:slot--dragging={dragFrom === index}
  class:slot--over-before={over === index && dragFrom !== null && dragFrom > index}
  class:slot--over-after={over === index && dragFrom !== null && dragFrom < index}
  role="button"
  tabindex="0"
  draggable="true"
  title={tooltip(slot, labelOf(slot))}
  onclick={() => openPicker(sentence.id, slot.id)}
  onkeydown={(event) => slotKeys(event, index)}
  ondragstart={(event) => dragStart(event, index)}
  ondragover={(event) => dragOver(event, index)}
  ondragleave={() => { if (over === index) over = null; }}
  ondrop={(event) => drop(event, index)}
  ondragend={clearDrag}
><CardFace {provider} id={symbolIdFor(slot, provider)} caption={slotCaption(slot)} mirrored={slot.mirrored} negated={slot.negated} /></div>{/each}<button class="slot-add" type="button" title={t('ui.add_slot')} onclick={() => void handleAddSlot(sentence.id)}>+</button></div></article>
