<script lang="ts">
  /**
   * A Rezept's box, where every other template has its composer: at the top,
   * with a switch in front of it that says which part the next line goes into.
   *
   * One box rather than one under each part, so that typing is in the same
   * place in every Sammlung. The switch is the price of that — and so it is
   * shown right at the box, named in the placeholder, and kept where it was
   * left, because a recipe is typed a part at a time: all the Zutaten, then
   * the Hilfsmittel, then the Schritte.
   */
  import type { RecipePart } from '../core/types.ts';
  import { RECIPE_PARTS } from '../core/types.ts';
  import TypingBox from './TypingBox.svelte';
  import { addLines } from '../app/composing.ts';
  import { followsDefault, activeCollection, provider, providerReady, s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let part = $state<RecipePart>('zutat');
  let draft = $state('');
  let waiting = $state(false);
  let ready = $derived(providerReady());
  let own = $derived(Boolean(activeCollection()) && !followsDefault());

  async function submit(): Promise<void> {
    const raw = draft;
    if (!raw.trim() || s.busy) return;
    draft = '';
    waiting = true;
    try {
      const left = await addLines(raw, part);
      if (left) draft = draft ? `${left}\n${draft}` : left;
    } finally {
      waiting = false;
    }
  }
</script>

{#snippet meta()}<span class="segmented recipe__parts" role="group" aria-label={t('ui.recipe_goes_into')}>{#each RECIPE_PARTS as which (which)}<button type="button" aria-pressed={part === which} onclick={() => { part = which; }}>{t(`ui.recipe_${which}`)}</button>{/each}</span><span class="composer__provider"><span>{own ? t('ui.symbols_of_collection') : t('ui.symbols_default')}</span><b style="font-weight:600">{provider().name}{ready ? '' : ` (${t('ui.not_ready')})`}</b></span>{/snippet}

<TypingBox
  value={draft}
  busy={waiting}
  placeholder={t(`ui.recipe_${part}_placeholder`)}
  label={t(`ui.recipe_${part}_label`)}
  action={t('ui.translate')}
  {meta}
  focusOnMount
  onChange={(value) => { draft = value; }}
  onSubmit={() => void submit()}
/>
