<script lang="ts">
  /**
   * The row over the material: one button per thing on the sheet — Seite,
   * Titel, Symbol — and behind each all of that thing's settings, colours and
   * sizes included. The same three in every template that has moved; what a
   * template's geometry owns is shown as a readout, never as a greyed field.
   *
   * The Einkaufsliste is the first template drawn this way (2026-10-22); the
   * others follow one by one, and until they do their settings stay in the
   * print preview's column.
   */
  import { materialPrint } from '../app/print.ts';
  import { kind, providerId } from '../app/state.svelte.ts';
  import PaletteRow from './PaletteRow.svelte';
  import { t } from '../i18n/index.ts';

  let open = $state<'page' | 'title' | 'symbol' | null>(null);
  let host: HTMLElement | undefined = $state();

  let mp = $derived(materialPrint());
  let metacom = $derived(providerId() === 'metacom');
  /* The one colour of the material, set at the title: the strong things —
     title, its line, the frames, the cart — follow it together. */
  const paintMaterial = (colour: string | null) =>
    mp?.patch({ titleColour: colour, cartColour: colour, cardBorderColor: colour ?? '#333333' });

  const away = (event: PointerEvent) => {
    if (open && host && !host.contains(event.target as Node)) open = null;
  };
  const show = (which: 'page' | 'title' | 'symbol') => { open = open === which ? null : which; };
  const POSITIONS = ['above', 'below'] as const;

  function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') open = null; }} />

{#snippet check(label: string, checked: boolean, onToggle: (next: boolean) => void)}<label class="ding-check"><input type="checkbox" {checked} onchange={(event) => onToggle(event.currentTarget.checked)} />{label}</label>{/snippet}

{#if mp}<div class="ding-bar" bind:this={host}>
  <span class="ding"><button class="ding__chip{mp.settings.pageColour ? ' ding__chip--on' : ''}" type="button" aria-label={t('ui.ding_page')} aria-expanded={open === 'page'} onclick={() => show('page')}>{t('ui.ding_page')}{#if mp.settings.pageColour}<span class="ding__dot" style:--c={mp.settings.pageColour}></span>{/if}<span class="ding__dd">▾</span></button>{#if open === 'page'}<div class="ding__pop" role="group" aria-label={t('ui.ding_page')}>
    <PaletteRow label={t('ui.page_colour')} value={mp.settings.pageColour} strength="fill" none ownStart="#d9ebd3" onPick={(next) => mp?.set('pageColour', next)} />
    {#if kind() === 'einkaufsliste'}{@render check(t('ui.shop_guide_print'), mp.settings.showGuide, (next) => mp?.set('showGuide', next))}{/if}
    {@render check(t('ui.page_numbers'), mp.settings.showPageNumbers, (next) => mp?.set('showPageNumbers', next))}
    {#if metacom}{@render check(t('ui.print_copyright'), mp.settings.showCopyright, (next) => mp?.set('showCopyright', next))}{/if}
  </div>{/if}</span>
  <span class="ding"><button class="ding__chip{mp.settings.titleColour ? ' ding__chip--on' : ''}" type="button" aria-label={t('ui.ding_title')} aria-expanded={open === 'title'} onclick={() => show('title')}>{t('ui.ding_title')}{#if mp.settings.titleColour}<span class="ding__dot" style:--c={mp.settings.titleColour}></span>{/if}<span class="ding__dd">▾</span></button>{#if open === 'title'}<div class="ding__pop" role="group" aria-label={t('ui.ding_title')}>
    <p class="small faint ding__hint">{t('ui.title_on_sheet_hint')}</p>
    <label class="ding-num">{t('ui.title_size')} <input class="field" type="number" min="8" max="40" step="1" value={mp.settings.titleSizePt} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, 8, 40, 15); event.currentTarget.value = String(n); mp?.set('titleSizePt', n); }} /> pt</label>
    <PaletteRow label={t('ui.colour')} value={mp.settings.titleColour} strength="frame" none ownStart="#3d7d3a" onPick={paintMaterial} />
    <p class="small faint ding__hint">{t('ui.material_colour_hint')}</p>
    {@render check(t('ui.title_line'), mp.settings.titleLine, (next) => mp?.set('titleLine', next))}
  </div>{/if}</span>
  <span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_symbol')} aria-expanded={open === 'symbol'} onclick={() => show('symbol')}>{t('ui.ding_symbol')}<span class="ding__dd">▾</span></button>{#if open === 'symbol'}<div class="ding__pop" role="group" aria-label={t('ui.ding_symbol')}>
    {#if kind() === 'einkaufsliste'}<p class="small faint ding__hint">{t('ui.symbol_from_paper', { size: mp.settings.symbolSizeMm, margin: mp.settings.cutMarginMm })}</p><p class="small faint ding__hint">{t('ui.shop_word_fixed')}</p>{:else}<div class="ding__row">{@render check(t('ui.print_label'), mp.settings.showLabel, (next) => mp?.set('showLabel', next))}{#if mp.settings.showLabel}<span class="segmented">{#each POSITIONS as where (where)}<button type="button" aria-pressed={mp.settings.labelPosition === where} onclick={() => mp?.set('labelPosition', where)}>{where === 'above' ? t('ui.label_above') : t('ui.label_below')}</button>{/each}</span><span class="small faint">{mp.settings.labelSizePt} pt</span>{/if}</div>{/if}
    <div class="ding__row">{@render check(t('ui.frame_each'), mp.settings.cardBorderMm > 0, (next) => mp?.set('cardBorderMm', next ? 0.5 : 0))}{#if mp.settings.cardBorderMm > 0}<label class="ding-num">{t('ui.thickness')} <input class="field" type="number" min="0.1" max="5" step="0.1" value={mp.settings.cardBorderMm} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, 0.1, 5, 0.5); event.currentTarget.value = String(n); mp?.set('cardBorderMm', n); }} /> mm</label><label class="ding-num">{t('ui.corners')} <input class="field" type="number" min="0" max="15" step="0.5" value={mp.settings.cardRadiusMm} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, 0, 15, 2); event.currentTarget.value = String(n); mp?.set('cardRadiusMm', n); }} /> mm</label>{/if}</div>
    <PaletteRow label={t('ui.cards_fill')} value={mp.settings.cardBackground} strength="fill" none ownStart="#fff1b3" onPick={(next) => mp?.set('cardBackground', next)} />
    {@render check(t('ui.cut_lines'), mp.settings.showCutLines, (next) => mp?.set('showCutLines', next))}
  </div>{/if}</span>
</div>{/if}
