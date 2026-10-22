<script lang="ts">
  /**
   * The paper, in the head: the one button that already said „A4 hoch ·
   * 2 Seiten" is now the choice itself. Clicking it opens the sizes and,
   * where the template lets the sheet turn, hoch/quer; the page count beside
   * them follows the last time the sheet was laid out.
   *
   * Top level on purpose: which paper a material goes on is the first
   * decision of her workflow, so it does not live inside any menu.
   */
  import type { PaperSize } from '../core/types.ts';
  import { materialPrint } from '../app/print.ts';
  import { activeCollection, kind, s } from '../app/state.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import { t } from '../i18n/index.ts';

  let open = $state(false);
  let host: HTMLElement | undefined = $state();

  let mp = $derived(materialPrint());
  let offer = $derived(mp ? TEMPLATES[kind()].offers(mp.settings).paper : undefined);
  let label = $derived.by(() => {
    const id = activeCollection()?.id;
    if (!mp || !id) return '';
    const side = mp.settings.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait');
    const pages = s.pagesSeen[id];
    const size = offer === 'size' ? mp.settings.paper.toUpperCase() : `${mp.settings.paper.toUpperCase()} ${side.toLowerCase()}`;
    return `${size}${pages ? ` · ${t(pages === 1 ? 'ui.n_page' : 'ui.n_pages', { n: pages })}` : ''}`;
  });

  const away = (event: PointerEvent) => {
    if (open && host && !host.contains(event.target as Node)) open = false;
  };
  const PAPERS: PaperSize[] = ['a5', 'a4', 'a3'];
  const SIDES = ['portrait', 'landscape'] as const;
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') open = false; }} />

{#if mp && offer}<span class="paper-pick" bind:this={host}><button class="collection-head__paper small faint" type="button" aria-expanded={open} aria-label={t('ui.paper_pick')} title={t('ui.paper_pick')} onclick={() => { open = !open; }}>{label}</button>{#if open}<span class="paper-pick__pop" role="group" aria-label={t('ui.paper_pick')}><span class="segmented">{#each PAPERS as paper (paper)}<button type="button" aria-pressed={mp.settings.paper === paper} onclick={() => mp?.set('paper', paper)}>{paper.toUpperCase()}</button>{/each}</span>{#if offer === true}<span class="segmented">{#each SIDES as side (side)}<button type="button" aria-pressed={mp.settings.orientation === side} onclick={() => mp?.set('orientation', side)}>{side === 'portrait' ? t('ui.portrait') : t('ui.landscape')}</button>{/each}</span>{/if}</span>{/if}</span>{/if}
