<script lang="ts">
  /**
   * One wall of cards in a part: a Rezept's Zutaten or Hilfsmittel, an
   * Erzählen sheet's top, middle or foot. A card is a Wortkarte, „+" at the
   * end opens the picker, and a card is dragged to another place in its own
   * part — never into another, so each wall keeps what it carries to itself.
   */
  import type { ProviderId, Sentence } from '../core/types.ts';
  import WordCard from './WordCard.svelte';
  import AddTile from './AddTile.svelte';
  import { t } from '../i18n/index.ts';

  let { entries, provider, addLabel, onAdd, onMove, whisper = null }: {
    entries: Sentence[];
    provider: ProviderId;
    /** The „+" card's name; without it the wall takes no more cards. */
    addLabel: string | null;
    onAdd: () => void;
    onMove: (from: number, to: number) => void;
    /** A line beside the „+" while the wall is empty. */
    whisper?: string | null;
  } = $props();

  /* The card carried, and the place it is over. */
  let carrying = $state<number | null>(null);
  let over = $state<number | null>(null);
  function grab(event: DragEvent, from: number): void {
    event.stopPropagation();
    carrying = from;
    event.dataTransfer?.setData('text/plain', String(from));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function dragOver(event: DragEvent, at: number): void {
    if (carrying === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    over = at;
  }
  function dropOn(event: DragEvent, at: number): void {
    const was = carrying;
    carrying = null; over = null;
    if (was === null) return;
    event.preventDefault();
    if (was !== at) onMove(was, at);
  }
  const marks = (at: number): string => carrying === null || over !== at || carrying === at
    ? '' : carrying > at ? ' recipe__entry--before' : ' recipe__entry--after';
</script>

<div class="words recipe__cards">{#each entries as sentence, at (sentence.id)}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="recipe__entry{marks(at)}" draggable="true" title={t('ui.drag_to_reorder')} ondragstart={(event) => grab(event, at)} ondragover={(event) => dragOver(event, at)} ondrop={(event) => dropOn(event, at)} ondragend={() => { carrying = null; over = null; }}><WordCard {sentence} {provider} /></div>{/each}{#if addLabel}<AddTile label={addLabel} onAdd={onAdd} />{/if}{#if entries.length === 0 && whisper}<span class="empty-whisper empty-whisper--wall">{whisper}</span>{/if}</div>
