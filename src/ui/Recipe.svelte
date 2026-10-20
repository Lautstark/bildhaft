<script lang="ts">
  /**
   * A Rezept: what is needed, and what is done with it — two boxes, because
   * they are two different things to look at and to write.
   *
   * The first holds two walls of cards, the Zutaten and the Hilfsmittel; the
   * second holds the Schritte, one row each and numbered. Nothing here is new
   * in itself: a card is the card a Wortkarten-Sammlung draws and a Schritt is
   * the row a Satzstreifen draws, so the picker, the captions, the drag inside
   * a row and the delete all behave as they do there.
   *
   * Lines are typed into the box at the top, into the part chosen under it
   * (RecipeComposer) — and that part is outlined here, so what is typed is
   * seen to land somewhere. Each part also takes its own: „+ Zutat" under it,
   * and „✎ Text" to write it again as text, the way a Lied's parts are. An
   * empty part says so, rather than standing as a bare heading.
   *
   * Oldest first in every part, because a recipe is written top to bottom —
   * the reverse of the newest-first list a Satzstreifen is.
   */
  import type { ProviderId, RecipePart } from '../core/types.ts';
  import Row from './Row.svelte';
  import WordCard from './WordCard.svelte';
  import { addToPart, entriesOf, partText, rewritePart } from '../app/recipe.ts';
  import { s } from '../app/state.svelte.ts';
  import { inTurn } from '../app/inTurn.ts';
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
  let line = $state('');
  let editing = $state<RecipePart | null>(null);
  let text = $state('');

  $effect(() => { void s.activeId; adding = null; editing = null; });

  function startAdding(part: RecipePart): void { editing = null; adding = part; line = ''; }

  const send = inTurn();
  function sendLine(): void {
    const part = adding;
    const raw = line;
    if (!part || !raw.trim()) return;
    line = '';
    send(async () => {
      const left = await addToPart(part, raw);
      if (left) line = line ? `${left}\n${line}` : left;
    });
  }

  function lineKeys(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendLine(); }
    if (event.key === 'Escape') { event.preventDefault(); adding = null; }
  }
  /* Not disabled while a line is looked up: a disabled field drops the
     focus, and the field went with it, so the next line had nowhere to go.
     A line typed meanwhile waits until Enter finds the source free. */
  /* Left empty, the field goes — a moment after, so the click that took the
     focus lands where it was aimed before the page moves under it. */
  function lineLeft(): void {
    const was = adding;
    window.setTimeout(() => { if (!line.trim() && adding === was) adding = null; }, 150);
  }

  function startEditing(part: RecipePart): void { adding = null; editing = part; text = partText(part); }

  async function finishEditing(): Promise<void> {
    const part = editing;
    if (!part || s.busy) return;
    if (text.trim() === partText(part).trim()) { editing = null; return; }
    const left = await rewritePart(part, text);
    if (left) { text = left; return; }
    editing = null;
  }

  function editKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); editing = null; }
  }

  function focused(node: HTMLElement): void { node.focus(); }
</script>

{#snippet part(which: RecipePart)}{@const name = t(`ui.recipe_${which}`)}{@const entries = parts[which]}<section class="recipe__part{s.recipePart === which ? ' recipe__part--target' : ''}" aria-label={name}><div class="recipe__head"><h3>{name}</h3>{#if entries.length > 0 && editing !== which}<button class="song__tool recipe__tool" type="button" aria-label={t('ui.recipe_edit_part', { part: name })} onclick={() => startEditing(which)}>{t('ui.song_edit')}</button>{/if}</div>{#if editing === which}<div class="song__edit"><textarea class="song__text" use:focused bind:value={text} disabled={s.busy} aria-label={t('ui.recipe_edit_part', { part: name })} rows={Math.max(3, text.split('\n').length + 1)} onkeydown={editKeys}></textarea><div class="song__edit-acts"><span></span><button class="btn sm" type="button" onclick={() => { editing = null; }}>{t('ui.cancel')}</button><button class="btn primary sm" type="button" disabled={s.busy} onclick={() => void finishEditing()}>{t('ui.done')}</button></div></div>{:else}{#if entries.length === 0}<p class="small faint recipe__none">{t(`ui.recipe_${which}_none`)}</p>{:else if which === 'schritt'}<div class="rows">{#each entries as sentence, at (sentence.id)}<Row {sentence} {provider} step={at + 1} />{/each}</div>{:else}<div class="words">{#each entries as sentence (sentence.id)}<WordCard {sentence} {provider} />{/each}</div>{/if}{#if adding === which}<div class="song__add"><input class="song__line-input" use:focused bind:value={line} aria-label={t(`ui.recipe_${which}_new`)} placeholder={t(`ui.recipe_${which}_placeholder`)} onkeydown={lineKeys} onblur={lineLeft} /><button class="btn sm" type="button" disabled={!line.trim()} onclick={sendLine}>{t('ui.song_add')}</button></div>{:else}<button class="song__plus" type="button" onclick={() => startAdding(which)}>{t(`ui.recipe_${which}_add`)}</button>{/if}{/if}</section>{/snippet}

<div class="recipe"><div class="recipe__box">{@render part('zutat')}{@render part('hilfsmittel')}</div><div class="recipe__box">{@render part('schritt')}</div></div>
