<script lang="ts">
  /**
   * Wortkarten in Bearbeiten: the wall on its page, each card as it prints.
   *
   * The ground takes the page's colour, the title stands over the wall in the
   * material's colour with its line, and every card carries what the sheet
   * will give it — its ground, its frame, its word above or below. Pageless
   * on purpose: the wall flows, and where the sheet breaks stays the
   * preview's question.
   *
   * Over it the Zeile (DingBar); the title is fetched with „+ Titel" and
   * taken off with ×, like a Schritt or a Strophe.
   */
  import type { ProviderId, Sentence } from '../core/types.ts';
  import WordCard from './WordCard.svelte';
  import TitleLine from './TitleLine.svelte';
  import DingBar from './DingBar.svelte';
  import { materialPrint } from '../app/print.ts';
  import { handleNewCard } from '../app/board.ts';
  import { t } from '../i18n/index.ts';

  let { content, provider }: { content: Sentence[]; provider: ProviderId } = $props();

  let mp = $derived(materialPrint());
  let ink = $derived(mp?.settings.titleColour ?? '#222222');
  let titled = $derived(mp?.settings.showCollectionTitle ?? false);
</script>

{#if mp}<DingBar /><div class="card-board" class:card-board--label-above={mp.settings.labelPosition === 'above'} class:card-board--unlabelled={!mp.settings.showLabel} style:background={mp.settings.pageColour ?? 'var(--surface)'} style:--board-ink={ink} style:--cb-bg={mp.settings.cardBackground ?? '#ffffff'} style:--cb-border={mp.settings.cardBorderMm > 0 ? mp.settings.cardBorderColor : '#dcdcdc'} style:--cb-stroke={mp.settings.cardBorderMm > 0 ? `${Math.max(1.5, mp.settings.cardBorderMm * 2)}px` : '1px'} style:--cb-radius={`${Math.max(4, mp.settings.cardRadiusMm * 1.6)}px`}>
  <div class="card-board__top">{#if titled}<span class="shop-edit__title{mp.settings.titleLine ? ' shop-edit__title--lined' : ''}"><TitleLine /><button class="shop-edit__off" type="button" aria-label={t('ui.title_off')} title={t('ui.title_off')} onclick={() => mp?.set('showCollectionTitle', false)}>×</button></span>{:else}<button class="song__plus shop-edit__get" type="button" onclick={() => mp?.set('showCollectionTitle', true)}>{t('ui.title_get')}</button>{/if}</div>
  <div class="rows words card-board__wall">{#each content as sentence (sentence.id)}<WordCard {sentence} {provider} />{/each}<button class="word word--add" type="button" aria-label={t('ui.new_card')} onclick={() => void handleNewCard()}>+</button></div>
</div>{/if}
