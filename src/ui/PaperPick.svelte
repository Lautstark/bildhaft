<script lang="ts">
  /**
   * The paper, in the head: the one button that already said „A4 hoch ·
   * 2 Seiten" is now the choice itself. Clicking it opens the sizes and,
   * where the template lets the sheet turn, hoch/quer; the page count beside
   * them follows the last time the sheet was laid out. On A5 it counts
   * sheets — what comes out of the printer, two pages each — and says so.
   *
   * Top level on purpose: which paper a material goes on is the first
   * decision of her workflow, so it does not live inside any menu.
   *
   * „Alle drucken" hands in its `source`: the paper for every ticked
   * material, for that print; its page count stands in the overlay's head.
   */
  import type { PaperSize } from '../core/types.ts';
  import { materialPrint, type PrintSource } from '../app/print.ts';
  import { twoUp } from './printSheet.ts';
  import { activeCollection, s } from '../app/state.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import { t } from '../i18n/index.ts';

  let { source = null }: { source?: PrintSource | null } = $props();

  let open = $state(false);
  let host: HTMLElement | undefined = $state();

  let mp = $derived(source ?? materialPrint());
  let offer = $derived(mp ? TEMPLATES[mp.kind].offers(mp.settings).paper : undefined);
  let apart = $derived(Boolean(mp?.mixed('paper') || mp?.mixed('orientation')));
  let label = $derived.by(() => {
    if (mp && apart) return t('ui.paper_mixed');
    const id = source ? 'group' : activeCollection()?.id;
    if (!mp || !id) return '';
    const side = mp.settings.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait');
    const pages = source ? 0 : s.pagesSeen[id];
    const size = offer === 'size' ? mp.settings.paper.toUpperCase() : `${mp.settings.paper.toUpperCase()} ${side.toLowerCase()}`;
    if (twoUp(mp.settings)) return `${size} · ${t('ui.two_per_a4')}${pages ? ` · ${t('ui.n_sheets', { n: pages })}` : ''}`;
    return `${size}${pages ? ` · ${t(pages === 1 ? 'ui.n_page' : 'ui.n_pages', { n: pages })}` : ''}`;
  });

  const away = (event: PointerEvent) => {
    if (open && host && !host.contains(event.target as Node)) open = false;
  };
  const PAPERS: PaperSize[] = ['a5', 'a4'];
  const SIDES = ['portrait', 'landscape'] as const;
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') open = false; }} />

{#if mp && offer}<span class="paper-pick" bind:this={host}><button class="collection-head__paper small faint" type="button" aria-expanded={open} aria-label={t('ui.paper_pick')} title={t('ui.paper_pick')} onclick={() => { open = !open; }}>{label}</button>{#if open}<span class="paper-pick__pop" role="group" aria-label={t('ui.paper_pick')}>{#if offer !== 'side'}<span class="segmented">{#each PAPERS as paper (paper)}<button type="button" aria-pressed={!mp.mixed('paper') && mp.settings.paper === paper} onclick={() => mp?.set('paper', paper)}>{paper.toUpperCase()}</button>{/each}</span>{/if}{#if offer === true || offer === 'side'}<span class="segmented">{#each SIDES as side (side)}<button type="button" aria-pressed={!mp.mixed('orientation') && mp.settings.orientation === side} onclick={() => mp?.set('orientation', side)}>{side === 'portrait' ? t('ui.portrait') : t('ui.landscape')}</button>{/each}</span>{/if}</span>{/if}</span>{/if}
