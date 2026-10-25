<script lang="ts">
  /**
   * A Rezept: what is needed, and what is done with it — two boxes, because
   * they are two different things to look at and to write.
   *
   * The first holds two walls of cards, the Zutaten and the Hilfsmittel; the
   * second holds the Schritte, one row each and numbered. A Schritt is the row
   * a Satzstreifen draws, so the picker, the drag inside a row, its „+" for
   * one more symbol and the delete all behave as they do there. A card is a
   * Wortkarte, with the Wortkarten's „+" at the end of its wall: the picker
   * opens, and the card's text — „250 g Mehl" — is written in the same
   * dialog, with the cross and the mirror, when the card is opened.
   *
   * Nothing is typed at the top. A Schritt is typed as a line
   * under „+ Schritt". „✎ Text" writes a part again as text, the way a Lied's
   * parts are. Cards and Schritte are dragged to another place in their part —
   * a card as a whole, as on a Tafel, a Schritt by its number.
   *
   * Oldest first in every part, because a recipe is written top to bottom —
   * the reverse of the newest-first list a Satzstreifen is.
   */
  import type { ProviderId, RecipePart } from '../core/types.ts';
  import Row from './Row.svelte';
  import WordCard from './WordCard.svelte';
  import LineAdd from './LineAdd.svelte';
  import { addCard, addToPart, entriesOf, moveEntry, partText, rewritePart } from '../app/recipe.ts';
  import { s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  /* Read through s.sentences, so every part follows a write. */
  let parts = $derived.by(() => {
    void s.sentences;
    return {
      zutat: entriesOf('zutat'),
      hilfsmittel: entriesOf('hilfsmittel'),
      schritt: entriesOf('schritt'),
    };
  });

  /* The part a line is being typed under, and the part written as text. */
  let adding = $state<RecipePart | null>(null);
  let editing = $state<RecipePart | null>(null);
  let text = $state('');

  $effect(() => { void s.activeId; adding = null; editing = null; });

  function newCard(part: RecipePart): void {
    adding = null; editing = null;
    void addCard(part);
  }

  /* An entry carried to another place in its own part, and the place it is
     over. A symbol dragged inside a Schritt is the row's own and is let be. */
  let carrying = $state<{ part: RecipePart; from: number } | null>(null);
  let over = $state<number | null>(null);
  function grab(event: DragEvent, part: RecipePart, from: number): void {
    event.stopPropagation();
    carrying = { part, from };
    event.dataTransfer?.setData('text/plain', String(from));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  function dragOver(event: DragEvent, part: RecipePart, at: number): void {
    if (carrying?.part !== part) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    over = at;
  }
  function dropOn(event: DragEvent, part: RecipePart, at: number): void {
    const was = carrying;
    carrying = null; over = null;
    if (was?.part !== part) return;
    event.preventDefault();
    if (was.from !== at) void moveEntry(part, was.from, at);
  }
  const marks = (part: RecipePart, at: number): string => carrying?.part !== part || over !== at || carrying.from === at
    ? '' : carrying.from > at ? ' recipe__entry--before' : ' recipe__entry--after';

  function startEditing(part: RecipePart): void { adding = null; editing = part; text = partText(part); }

  async function finishEditing(): Promise<void> {
    const part = editing;
    if (!part || s.busy) return;
    if (text.trim() === partText(part).trim()) { editing = null; return; }
    const left = await rewritePart(part, text);
    if (left) { text = left; return; }
    editing = null;
  }

  /* As in the box everywhere: Enter finishes, Shift+Enter is the new line. */
  function editKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); editing = null; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!s.busy) void finishEditing(); }
  }

  function focused(node: HTMLElement): void { node.focus(); }
</script>

{#snippet part(which: RecipePart)}{@const name = t(`ui.recipe_${which}`)}{@const entries = parts[which]}<section class="recipe__part" aria-label={name}><div class="recipe__head"><h3>{name}</h3>{#if entries.length > 0 && editing !== which}<button class="song__tool recipe__tool" type="button" aria-label={t('ui.recipe_edit_part', { part: name })} onclick={() => startEditing(which)}>{t('ui.song_edit')}</button>{/if}</div>{#if editing === which}<div class="song__edit"><textarea class="song__text" use:focused bind:value={text} disabled={s.busy} aria-label={t('ui.recipe_edit_part', { part: name })} rows={Math.max(3, text.split('\n').length + 1)} onkeydown={editKeys}></textarea><div class="song__edit-acts"><span></span><button class="btn sm" type="button" onclick={() => { editing = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy} onclick={() => void finishEditing()}>{t('ui.done')}</button></div></div>{:else if which === 'schritt'}{#if entries.length === 0}<p class="small faint recipe__none">{t('ui.recipe_schritt_none')}</p>{:else}<div class="rows">{#each entries as sentence, at (sentence.id)}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="recipe__entry{marks(which, at)}" ondragover={(event) => dragOver(event, which, at)} ondrop={(event) => dropOn(event, which, at)} ondragend={() => { carrying = null; over = null; }}><Row {sentence} {provider} step={at + 1} onGrab={(event) => grab(event, which, at)} /></div>{/each}</div>{/if}<LineAdd open={adding === which} plus={t('ui.recipe_schritt_add')} label={t('ui.recipe_schritt_new')} placeholder={t('ui.recipe_schritt_placeholder')} onOpen={() => { editing = null; adding = which; }} onClose={() => { adding = null; }} onSend={(raw) => addToPart(which, raw)} />{:else}<div class="words recipe__cards">{#each entries as sentence, at (sentence.id)}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="recipe__entry{marks(which, at)}" draggable="true" title={t('ui.drag_to_reorder')} ondragstart={(event) => grab(event, which, at)} ondragover={(event) => dragOver(event, which, at)} ondrop={(event) => dropOn(event, which, at)} ondragend={() => { carrying = null; over = null; }}><WordCard {sentence} {provider} /></div>{/each}<button class="word word--add" type="button" aria-label={t(`ui.recipe_${which}_label`)} onclick={() => newCard(which)}>+</button>{#if entries.length === 0 && which === 'zutat'}<span class="empty-whisper empty-whisper--wall">{t('ui.zutat_whisper')}</span>{/if}</div>{/if}</section>{/snippet}

<div class="recipe"><div class="recipe__box">{@render part('zutat')}{@render part('hilfsmittel')}</div><div class="recipe__box">{@render part('schritt')}</div></div>
