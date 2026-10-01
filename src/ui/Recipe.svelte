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
   * What is new is that each part has its own box to type into, under its own
   * wall. One box at the top would need a second control saying where the next
   * line goes, and that control is exactly what a person forgets to switch.
   *
   * Oldest first in every part, because a recipe is written top to bottom —
   * the reverse of the newest-first list a Satzstreifen is.
   */
  import type { ProviderId, RecipePart, Sentence } from '../core/types.ts';
  import { partOf } from '../core/types.ts';
  import Row from './Row.svelte';
  import TypingBox from './TypingBox.svelte';
  import WordCard from './WordCard.svelte';
  import { addLines } from '../app/composing.ts';
  import { s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let ordered = $derived([...s.sentences].sort((a, b) => a.createdAt - b.createdAt));
  const inPart = (part: RecipePart): Sentence[] => ordered.filter((sentence) => partOf(sentence) === part);

  /* Each box keeps its own draft. They are three fields on one page, and what
     is half typed into one must not appear in another. */
  let drafts = $state<Record<RecipePart, string>>({ zutat: '', hilfsmittel: '', schritt: '' });
  /* Which box is waiting, so only that one spins. The others stay usable to
     look at; a line sent from one while another is still translating is put
     back into its box, as a failed line is, rather than lost. */
  let waiting = $state<RecipePart | null>(null);

  async function submit(part: RecipePart): Promise<void> {
    const raw = drafts[part];
    if (!raw.trim() || s.busy) return;
    drafts[part] = '';
    waiting = part;
    try {
      const left = await addLines(raw, part);
      if (left) drafts[part] = drafts[part] ? `${left}\n${drafts[part]}` : left;
    } finally {
      waiting = null;
    }
  }
</script>

{#snippet nothing()}{/snippet}

{#snippet box(part: RecipePart)}<div class="recipe__type"><TypingBox
  value={drafts[part]}
  busy={waiting === part}
  placeholder={t(`ui.recipe_${part}_placeholder`)}
  label={t(`ui.recipe_${part}_label`)}
  action={t('ui.translate')}
  meta={nothing}
  onChange={(value) => { drafts[part] = value; }}
  onSubmit={() => void submit(part)}
/></div>{/snippet}

{#snippet cards(part: RecipePart)}<section class="recipe__part" aria-label={t(`ui.recipe_${part}`)}><h3 class="recipe__head">{t(`ui.recipe_${part}`)}</h3>{#if inPart(part).length > 0}<div class="words">{#each inPart(part) as sentence (sentence.id)}<WordCard {sentence} {provider} />{/each}</div>{/if}{@render box(part)}</section>{/snippet}

<div class="recipe"><div class="recipe__box">{@render cards('zutat')}{@render cards('hilfsmittel')}</div><div class="recipe__box"><section class="recipe__part" aria-label={t('ui.recipe_schritt')}><h3 class="recipe__head">{t('ui.recipe_schritt')}</h3>{#if inPart('schritt').length > 0}<div class="rows">{#each inPart('schritt') as sentence, at (sentence.id)}<Row {sentence} {provider} step={at + 1} />{/each}</div>{/if}{@render box('schritt')}</section></div></div>
