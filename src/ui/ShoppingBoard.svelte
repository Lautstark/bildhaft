<script lang="ts">
  /**
   * An Einkaufsliste in Bearbeiten: the board, not a wall of cards.
   *
   * What prints is a green board with its name, its cart and a field per
   * card — so that is what is edited: the page's colour behind it, the title
   * in its colour with its line, each card standing in its dashed field, and
   * a „+" field for the next one. Pageless on purpose: the fields flow, and
   * how many fit a sheet stays the preview's question.
   *
   * Over it the Zeile: Seite · Titel · Symbol (DingBar). The title is not a
   * setting there — it is taken off the sheet with its ×, and a board
   * without one offers „+ Titel" where it stood, like „+ Schritt" offers the
   * next step.
   */
  import type { ProviderId } from '../core/types.ts';
  import { contentOf } from '../core/types.ts';
  import WordCard from './WordCard.svelte';
  import TitleLine from './TitleLine.svelte';
  import DingBar from './DingBar.svelte';
  import { materialPrint } from '../app/print.ts';
  import { handleNewCard } from '../app/board.ts';
  import { s } from '../app/state.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { provider }: { provider: ProviderId } = $props();

  let mp = $derived(materialPrint());
  let content = $derived(contentOf(s.sentences));
  let ink = $derived(mp?.settings.titleColour ?? '#222222');
  let titled = $derived(mp?.settings.showCollectionTitle ?? false);
</script>

{#if mp}<DingBar /><div class="shop-edit" style:background={mp.settings.pageColour ?? 'var(--surface)'} style:--board-ink={ink}>
  <div class="shop-edit__top">{#if titled}<span class="shop-edit__title{mp.settings.titleLine ? ' shop-edit__title--lined' : ''}"><TitleLine /><button class="shop-edit__off" type="button" aria-label={t('ui.title_off')} title={t('ui.title_off')} onclick={() => mp?.set('showCollectionTitle', false)}>×</button></span>{:else}<button class="song__plus shop-edit__get" type="button" onclick={() => mp?.set('showCollectionTitle', true)}>{t('ui.title_get')}</button>{/if}<svg class="shop-edit__cart" style:color={mp.settings.cartColour ?? '#b4b9be'} width="34" height="29" viewBox="0 0 26 22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 2h3l3 12h12l3-9H6" /><circle cx="9" cy="19" r="1.8" /><circle cx="17" cy="19" r="1.8" /></svg></div>
  <div class="shop-edit__grid">{#each content as sentence (sentence.id)}<div class="shop-edit__field"><WordCard {sentence} {provider} /></div>{/each}<button class="shop-edit__field shop-edit__field--add" type="button" aria-label={t('ui.new_card')} onclick={() => void handleNewCard()}>+</button></div>
</div>{/if}
