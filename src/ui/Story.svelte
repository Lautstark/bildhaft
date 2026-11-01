<script lang="ts">
  /**
   * An Erzählen sheet: two walls of cards, top to bottom as on paper —
   * what is told, and the cards to answer with.
   *
   * A Rezept's Zutaten wall twice over, and nothing else. A photo is
   * no different from a symbol: it is an own picture, chosen in the same
   * picker. The middle stops taking cards at four, which is all one row on
   * paper holds.
   */
  import type { ProviderId } from '../core/types.ts';
  import { STORY_PARTS } from '../core/types.ts';
  import CardWall from './CardWall.svelte';
  import { entriesOf, moveEntry } from '../app/recipe.ts';
  import { addStoryCard, roomIn } from '../app/story.ts';
  import { s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  /* Read through s.sentences, so every part follows a write. */
  let parts = $derived.by(() => {
    void s.sentences;
    return { mitte: entriesOf('mitte'), unten: entriesOf('unten') };
  });
</script>

<div class="recipe"><div class="recipe__box">{#each STORY_PARTS as which (which)}<section class="recipe__part" aria-label={t(`ui.story_${which}`)}><div class="recipe__head"><h3>{t(`ui.story_${which}`)}</h3></div><CardWall entries={parts[which]} {provider} addLabel={roomIn(which) ? t('ui.story_add') : null} onAdd={() => void addStoryCard(which)} onMove={(from, to) => void moveEntry(which, from, to)} whisper={which === 'mitte' ? t('ui.story_mitte_whisper') : null} /></section>{/each}</div></div>
