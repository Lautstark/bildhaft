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
   * The lines are typed into the box at the top, with the part chosen in
   * front of it (RecipeComposer) — the same place every template is typed
   * into.
   *
   * Oldest first in every part, because a recipe is written top to bottom —
   * the reverse of the newest-first list a Satzstreifen is.
   */
  import type { ProviderId, RecipePart, Sentence } from '../core/types.ts';
  import { partOf } from '../core/types.ts';
  import Row from './Row.svelte';
  import WordCard from './WordCard.svelte';
  import { s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let ordered = $derived([...s.sentences].sort((a, b) => a.createdAt - b.createdAt));
  const inPart = (part: RecipePart): Sentence[] => ordered.filter((sentence) => partOf(sentence) === part);

</script>

{#snippet cards(part: RecipePart)}<section class="recipe__part" aria-label={t(`ui.recipe_${part}`)}><h3 class="recipe__head">{t(`ui.recipe_${part}`)}</h3>{#if inPart(part).length > 0}<div class="words">{#each inPart(part) as sentence (sentence.id)}<WordCard {sentence} {provider} />{/each}</div>{/if}</section>{/snippet}

<div class="recipe"><div class="recipe__box">{@render cards('zutat')}{@render cards('hilfsmittel')}</div><div class="recipe__box"><section class="recipe__part" aria-label={t('ui.recipe_schritt')}><h3 class="recipe__head">{t('ui.recipe_schritt')}</h3>{#if inPart('schritt').length > 0}<div class="rows">{#each inPart('schritt') as sentence, at (sentence.id)}<Row {sentence} {provider} step={at + 1} />{/each}</div>{/if}</section></div></div>
