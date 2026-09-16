<script lang="ts">
  /**
   * A card in a Wortkarten-Sammlung: one symbol, and the text that goes with it.
   *
   * The row a Satzstreifen-Sammlung draws is `Row.svelte`, and this is
   * deliberately not a variant of it. A row is a sentence — a title, a strip of
   * slots in an order somebody dragged, a „+" for the next word — and none of
   * that is true of a card, which holds exactly one thing and is going to be cut
   * out. Sharing one component between them would mean a component whose every
   * part is optional.
   *
   * What it does share is the wall the Wortschatz draws, down to the class
   * names: a card is a card whether the word is the household's or this
   * Sammlung's.
   */
  import type { ProviderId, Sentence } from '../core/types.ts';
  import { slotCaption, symbolIdFor } from '../core/types.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import { confirmDeleteSentence, noteUnreadable, openPicker } from '../app/editing.ts';
  import { t } from '../i18n/index.ts';

  let { sentence, provider }: { sentence: Sentence; provider: ProviderId } = $props();

  let slot = $derived(sentence.slots[0]);
  let caption = $derived(slot ? slotCaption(slot) : '');
  /* A card whose slot was never filled — made by the „+" tile, or typed as a
     word the source had nothing for. Dashed and asking, which is the same thing
     an unresolved slot says in a row. */
  let shown = $derived(slot ? symbolIdFor(slot, provider) : null);

  const open = () => { if (slot) openPicker(sentence.id, slot.id); };
  /* A div playing a button, and the same one `.slot` in a row is, for the same
     reason: on a Tafel the card is dragged, and Chrome will not start a drag
     from inside a real <button>. It did start one from the picture, because an
     image is draggable on its own — so a pictured card dragged when the
     pointer was on the picture and refused when it was a few pixels off, on
     the button's padding, and a card still asking for its picture never
     dragged at all. The keyboard keeps what a button gave it: Enter and Space. */
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="word">{#if shown}<div class="word__pic" role="button" tabindex="0" aria-label={t('ui.change_picture_for', { word: caption })} onclick={open} onkeydown={keys}><SymbolPicture {provider} id={shown} alt={caption} onUnreadable={(id) => void noteUnreadable(id)} /></div>{:else}<div class="word__pic word__pic--asking" role="button" tabindex="0" aria-label={t('ui.pick_picture_for', { word: caption || '…' })} onclick={open} onkeydown={keys}>?</div>{/if}<button class="word__drop" type="button" aria-label={t('ui.delete_card', { word: caption || '…' })} onclick={() => void confirmDeleteSentence(sentence)}>×</button><b class="word__name">{caption}</b></div>
