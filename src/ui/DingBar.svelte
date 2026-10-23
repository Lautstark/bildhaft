<script lang="ts">
  /**
   * The row over the material: one button per thing on the sheet — Seite,
   * Titel, Symbol — and behind each all of that thing's settings, colours and
   * sizes included. The same three in every template that has moved; what a
   * template's geometry owns is shown as a readout, never as a greyed field.
   *
   * Which rows a menu holds follows the template's `offers`, the same answer
   * the print column used to read — so a control is never invented here, only
   * moved. The Einkaufsliste and the Wortkarten are drawn this way
   * (2026-10-22); the others follow one by one, and until they do their
   * settings stay in the print preview's column.
   */
  import { materialPrint } from '../app/print.ts';
  import { kind, providerId } from '../app/state.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import PaletteRow from './PaletteRow.svelte';
  import { t } from '../i18n/index.ts';

  let open = $state<'page' | 'title' | 'symbol' | null>(null);
  /* Which ⓘ is unfolded: the menus stay lean, the words wait behind it. */
  let info = $state<string | null>(null);
  let host: HTMLElement | undefined = $state();

  let mp = $derived(materialPrint());
  let offer = $derived(mp ? TEMPLATES[kind()].offers(mp.settings) : null);
  let metacom = $derived(providerId() === 'metacom');
  let gridded = $derived(offer?.size?.kind === 'cards' && mp?.settings.sheetFit === 'grid');
  let exact = $derived(offer?.size?.kind === 'cards' && mp?.settings.sheetFit === 'card');
  /* The one colour of the material, set at the title: the strong things —
     title, its line, the frames, the cart — follow it together. */
  const paintMaterial = (colour: string | null) =>
    mp?.patch({ titleColour: colour, cartColour: colour, cardBorderColor: colour ?? '#333333' });

  const away = (event: PointerEvent) => {
    if (open && host && !host.contains(event.target as Node)) open = null;
  };
  const show = (which: 'page' | 'title' | 'symbol') => { open = open === which ? null : which; info = null; };
  const POSITIONS = ['above', 'below'] as const;

  function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') open = null; }} />

{#snippet tip(id: string)}<button class="ding__info" type="button" aria-label={t('ui.info_show')} title={t('ui.info_show')} aria-expanded={info === id} onclick={() => { info = info === id ? null : id; }}>i</button>{/snippet}

{#snippet dd()}<span class="ding__dd"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg></span>{/snippet}

{#snippet check(label: string, checked: boolean, onToggle: (next: boolean) => void)}<label class="ding-check"><input type="checkbox" {checked} onchange={(event) => onToggle(event.currentTarget.checked)} />{label}</label>{/snippet}

{#snippet num(label: string, value: number, min: number, max: number, step: number, fallback: number, unit: string, onInput: (next: number) => void)}<!--
  Taken while it is typed once it is a number the field can hold — „1" on the
  way to „14" is not yet a size — and put right on the way out, the same two
  handlers the print column always had. Live, because the sheet beside it is.
--><label class="ding-num">{label} <input class="field" type="number" {min} {max} {step} {value} aria-label={label} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) onInput(n); }} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, min, max, fallback); event.currentTarget.value = String(n); onInput(n); }} /> {unit}</label>{/snippet}

{#if mp && offer}<div class="ding-bar" bind:this={host}>
  <span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_page')} aria-expanded={open === 'page'} onclick={() => show('page')}>{t('ui.ding_page')}{#if mp.settings.pageColour}<span class="ding__dot" style:--c={mp.settings.pageColour}></span>{/if}{@render dd()}</button>{#if open === 'page'}<div class="ding__pop" role="group" aria-label={t('ui.ding_page')}>
    {#if offer.page}<PaletteRow label={t('ui.page_colour')} value={mp.settings.pageColour} strength="fill" none ownStart="#d9ebd3" onPick={(next) => mp?.set('pageColour', next)} />{/if}
    {#if offer.guide}{@render check(t('ui.shop_guide_print'), mp.settings.showGuide, (next) => mp?.set('showGuide', next))}{/if}
    {#if offer.pageNumbers}{@render check(t('ui.page_numbers'), mp.settings.showPageNumbers, (next) => mp?.set('showPageNumbers', next))}{/if}
    {#if metacom}{@render check(t('ui.print_copyright'), mp.settings.showCopyright, (next) => mp?.set('showCopyright', next))}{/if}
  </div>{/if}</span>
  <span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_title')} aria-expanded={open === 'title'} onclick={() => show('title')}>{t('ui.ding_title')}{#if mp.settings.titleColour}<span class="ding__dot" style:--c={mp.settings.titleColour}></span>{/if}{@render dd()}</button>{#if open === 'title'}<div class="ding__pop" role="group" aria-label={t('ui.ding_title')}>
    <div class="ding__row">{@render check(t('ui.title_print'), mp.settings.showCollectionTitle, (next) => mp?.set('showCollectionTitle', next))}{@render num(t('ui.title_size'), mp.settings.titleSizePt, 8, 40, 1, 15, 'pt', (next) => mp?.set('titleSizePt', next))}{@render tip('titeltext')}</div>
    {#if info === 'titeltext'}<p class="small faint ding__hint">{t('ui.title_text_hint')}</p>{/if}
    <div class="ding__row ding__row--snug"><PaletteRow label={t('ui.colour')} value={mp.settings.titleColour} strength="frame" none ownStart="#3d7d3a" onPick={paintMaterial} />{@render tip('farbe')}</div>
    {#if info === 'farbe'}<p class="small faint ding__hint">{t('ui.material_colour_hint')}</p>{/if}
    {@render check(t('ui.title_line'), mp.settings.titleLine, (next) => mp?.set('titleLine', next))}
    {#if offer.title === 'pages'}<div class="ding__row"><span class="segmented">{#each [false, true] as every (every)}<button type="button" aria-pressed={mp.settings.titleEvery === every} onclick={() => mp?.set('titleEvery', every)}>{every ? t('ui.title_every') : t('ui.title_first')}</button>{/each}</span></div>{/if}
  </div>{/if}</span>
  <span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_symbol')} aria-expanded={open === 'symbol'} onclick={() => show('symbol')}>{t('ui.ding_symbol')}{#if offer.size?.kind !== 'cards' || (!gridded && !exact)}<span class="ding__meta">{mp.settings.symbolSizeMm} mm</span>{/if}{@render dd()}</button>{#if open === 'symbol'}<div class="ding__pop" role="group" aria-label={t('ui.ding_symbol')}>
    {#if offer.size?.kind === 'cards'}
      <div class="ding__row"><span class="segmented">
        <button type="button" aria-pressed={!gridded && !exact} onclick={() => mp?.set('sheetFit', 'size')}>{t('ui.fit_symbol')}</button>
        <button type="button" aria-pressed={exact} onclick={() => mp?.set('sheetFit', 'card')}>{t('ui.fit_card')}</button>
        <button type="button" aria-pressed={gridded} onclick={() => mp?.set('sheetFit', 'grid')}>{t('ui.grid')}</button>
      </span></div>
      {#if exact}<div class="ding__row">{@render num(t('ui.card_width'), mp.settings.cardWidthMm, 15, 300, 1, 60, 'mm', (next) => mp?.set('cardWidthMm', next))}<label class="ding-num">{t('ui.card_height')} <input class="field" type="number" min="15" max="300" step="1" value={mp.settings.cardHeightMm ?? ''} placeholder={String(mp.settings.cardWidthMm)} aria-label={t('ui.card_height')} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= 15 && n <= 300) mp?.set('cardHeightMm', n); }} onchange={(event) => { if (event.currentTarget.value.trim() === '') { mp?.set('cardHeightMm', null); return; } const n = clamp(event.currentTarget.valueAsNumber, 15, 300, 15); event.currentTarget.value = String(n); mp?.set('cardHeightMm', n); }} /> mm</label></div>
      {:else if gridded}<div class="ding__row">{@render num(t('ui.columns'), mp.settings.gridCols, 1, 12, 1, 4, '', (next) => mp?.set('gridCols', Math.round(next)))}{@render num(t('ui.rows'), mp.settings.gridRows, 1, 12, 1, 3, '', (next) => mp?.set('gridRows', Math.round(next)))}</div>
      {:else}{@render num(t('ui.symbol_size'), mp.settings.symbolSizeMm, 10, 120, 1, 40, 'mm', (next) => mp?.set('symbolSizeMm', next))}{/if}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next))}
    {:else if offer.size?.kind === 'symbol'}
      {@render num(t('ui.symbol_size'), mp.settings.symbolSizeMm, 10, offer.size.max, 1, offer.size.fallback, 'mm', (next) => mp?.set('symbolSizeMm', next))}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next))}
    {:else if kind() === 'einkaufsliste'}
      <div class="ding__row"><span class="small faint">{t('ui.symbol_from_paper', { size: mp.settings.symbolSizeMm, margin: mp.settings.cutMarginMm })}</span>{@render tip('brett')}</div>
      {#if info === 'brett'}<p class="small faint ding__hint">{t('ui.shop_geometry_info')}</p>{/if}
    {/if}
    {#if offer.label}<div class="ding__row">{@render check(t('ui.print_label'), mp.settings.showLabel, (next) => mp?.set('showLabel', next))}{#if mp.settings.showLabel}<span class="segmented">{#each POSITIONS as where (where)}<button type="button" aria-pressed={mp.settings.labelPosition === where} onclick={() => mp?.set('labelPosition', where)}>{where === 'above' ? t('ui.label_above') : t('ui.label_below')}</button>{/each}</span>{@render num(t('ui.label_size'), mp.settings.labelSizePt, 5, 40, 0.5, 11, 'pt', (next) => mp?.set('labelSizePt', next))}{/if}</div>
    {/if}
    {#if offer.frames || kind() === 'einkaufsliste'}<div class="ding__row">{@render check(t('ui.frame_each'), mp.settings.cardBorderMm > 0, (next) => mp?.set('cardBorderMm', next ? 0.5 : 0))}{#if mp.settings.cardBorderMm > 0}{@render num(t('ui.thickness'), mp.settings.cardBorderMm, 0.1, 5, 0.1, 0.5, 'mm', (next) => mp?.set('cardBorderMm', next))}{@render num(t('ui.corners'), mp.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', (next) => mp?.set('cardRadiusMm', next))}{/if}</div>{/if}
    {#if offer.background || kind() === 'einkaufsliste'}<PaletteRow label={t('ui.cards_fill')} value={mp.settings.cardBackground} strength="fill" none ownStart="#fff1b3" onPick={(next) => mp?.set('cardBackground', next)} />{/if}
    {#if offer.cutLines || kind() === 'einkaufsliste'}{@render check(t('ui.cut_lines'), mp.settings.showCutLines, (next) => mp?.set('showCutLines', next))}{/if}
  </div>{/if}</span>
</div>{/if}
