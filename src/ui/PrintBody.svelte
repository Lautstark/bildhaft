<script lang="ts">
  /**
   * What this material can be asked, and what the answer looks like on paper.
   *
   * Four templates, four lists — and a Satzstreifen-Sammlung has two, because
   * its rows print either as strips or cut into cards, and those are different
   * papers. An option that cannot mean anything for this material is not shown
   * greyed out; it is not shown.
   */
  import type { PrintSettings } from '../core/types.ts';
  import type { Snippet } from 'svelte';
  import PrintSheet from './PrintSheet.svelte';
  import { METACOM_COPYRIGHT } from './printSheet.ts';
  import type { Printing } from './printDialog.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Printing } = $props();

  /** What "give the cards a background" starts as before anyone picks a colour. */
  const DEFAULT_CARD_BACKGROUND = '#fff3bf';

  function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  let kind = $derived(s.options.kind);
  let strip = $derived(kind === 'satzstreifen' && s.settings.layout === 'strip');
  let cards = $derived(kind === 'wortkarten' || (kind === 'satzstreifen' && s.settings.layout === 'sheet'));
  let board = $derived(kind === 'tafel');
  let list = $derived(kind === 'einkaufsliste');
  let gridded = $derived(cards && s.settings.sheetFit === 'grid');
  /* The card named in millimetres, which only a card sheet can be asked. */
  let exact = $derived(cards && s.settings.sheetFit === 'card');
  let framed = $derived(s.settings.cardBorderMm > 0 || (strip && s.settings.stripFrame));

  const set = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => s.set(key, value);
</script>

{#snippet numberOpt(id: string, label: string, value: number, min: number, max: number, step: number, fallback: number, unit: string, hint: string | null, onInput: (next: number) => void, extra?: Snippet)}<div class="opt"><label for={id}>{label}</label><div class="opt__row"><input class="field" {id} type="number" {min} {max} {step} {value} aria-label={label} oninput={(event) => onInput(clamp(event.currentTarget.valueAsNumber, min, max, fallback))} /><span class="opt__unit">{unit}</span></div>{#if hint !== null}<span class="small faint">{hint}</span>{:else if extra}{@render extra()}{/if}</div>{/snippet}

{#snippet check(label: string, checked: boolean, onToggle: (next: boolean) => void)}<label class="opt__check"><input type="checkbox" {checked} onchange={(event) => onToggle(event.currentTarget.checked)} />{label}</label>{/snippet}

{#snippet colorOpt(id: string, label: string, value: string, onInput: (next: string) => void)}<div class="opt"><label for={id}>{label}</label><div class="opt__row"><input class="swatch" {id} type="color" {value} aria-label={label} oninput={(event) => onInput(event.currentTarget.value)} /></div></div>{/snippet}

{#snippet segmented(choices: { label: string; active: boolean; onPick: () => void }[], style: string)}<div class="segmented" {style}>{#each choices as choice (choice.label)}<button type="button" aria-pressed={choice.active} onclick={choice.onPick}>{choice.label}</button>{/each}</div>{/snippet}

{#snippet cardSize()}<span class="small faint{s.cardWarn ? ' opt__warn' : ''}">{s.cardSize}</span>{/snippet}

<!--
  The card's height may be left empty, and then the card is as high as it is
  wide. A square card is the usual one and typing 60 twice is one chance in two
  to mistype it; the width stands in the field as its placeholder, so the card
  that will be printed is still stated. Empty only counts on leaving the field —
  clearing it to type a new number must not square the card in between.
-->
{#snippet cardHeightOpt()}<div class="opt"><label for="opt-card-h">{t('ui.card_height')}</label><div class="opt__row"><input class="field" id="opt-card-h" type="number" min="15" max="300" step="1" value={s.settings.cardHeightMm ?? ''} placeholder={String(s.settings.cardWidthMm)} aria-label={t('ui.card_height')} oninput={(event) => { if (event.currentTarget.value.trim() === '') return; set('cardHeightMm', clamp(event.currentTarget.valueAsNumber, 15, 300, 15)); }} onchange={(event) => { if (event.currentTarget.value.trim() === '') set('cardHeightMm', null); }} /><span class="opt__unit">mm</span></div><span class="small faint">{t('ui.card_height_hint')}</span></div>{/snippet}

<div class="print-layout"><div>{#if kind === 'satzstreifen'}<div class="opt"><!-- svelte-ignore a11y_label_has_associated_control --><label>{t('ui.layout')}</label>{@render segmented([
  { label: t('ui.layout_strip'), active: strip, onPick: () => set('layout', 'strip') },
  { label: t('ui.layout_sheet'), active: !strip, onPick: () => set('layout', 'sheet') },
], '')}<span class="small faint">{strip ? t('ui.layout_strip_note') : t('ui.layout_sheet_note')}</span></div>{/if}<!--
  The Einkaufsliste is a material with its own paper; the rest choose.
-->{#if !list}<div class="opt"><!-- svelte-ignore a11y_label_has_associated_control --><label>{t('ui.paper')}</label>{@render segmented([
  { label: 'A5', active: s.settings.paper === 'a5', onPick: () => set('paper', 'a5') },
  { label: 'A4', active: s.settings.paper === 'a4', onPick: () => set('paper', 'a4') },
  { label: 'A3', active: s.settings.paper === 'a3', onPick: () => set('paper', 'a3') },
], '')}{@render segmented([
  { label: t('ui.portrait'), active: s.settings.orientation === 'portrait', onPick: () => set('orientation', 'portrait') },
  { label: t('ui.landscape'), active: s.settings.orientation === 'landscape', onPick: () => set('orientation', 'landscape') },
], 'margin-top:6px')}</div>{/if}<!--
  How big. Cards: the symbol, the card itself, or a grid. Strips: the symbol. A
  Tafel: its grid is its own, so only what the scissors would leave. The three
  are one question — which number do you have? — so they sit under one heading
  that names none of them.
-->{#if cards}<div class="opt"><!-- svelte-ignore a11y_label_has_associated_control --><label>{t('ui.size')}</label>{@render segmented([
  { label: t('ui.fit_symbol'), active: !gridded && !exact, onPick: () => set('sheetFit', 'size') },
  { label: t('ui.fit_card'), active: exact, onPick: () => set('sheetFit', 'card') },
  { label: t('ui.grid'), active: gridded, onPick: () => set('sheetFit', 'grid') },
], '')}<span class="small faint">{gridded ? t('ui.grid_note') : exact ? t('ui.card_note') : t('ui.fixed_note')}</span></div>{/if}{#if exact}<div class="opt"><div class="opt--pair">{@render numberOpt('opt-card-w', t('ui.card_width'), s.settings.cardWidthMm, 15, 300, 1, 60, 'mm', null, (next) => set('cardWidthMm', next))}{@render cardHeightOpt()}</div>{@render cardSize()}</div>{/if}{#if cards && gridded}<div class="opt"><div class="opt--pair">{@render numberOpt('opt-cols', t('ui.columns'), s.settings.gridCols, 1, 12, 1, 4, '', null, (next) => set('gridCols', Math.round(next)))}{@render numberOpt('opt-rows', t('ui.rows'), s.settings.gridRows, 1, 12, 1, 3, '', null, (next) => set('gridRows', Math.round(next)))}</div>{@render cardSize()}</div>{/if}{#if (cards && !gridded && !exact) || strip}{@render numberOpt('opt-size', t('ui.symbol_size'), s.settings.symbolSizeMm, 10, 120, 1, 40, 'mm', null, (next) => set('symbolSizeMm', next), cardSize)}{/if}{#if board}<div class="opt">{@render cardSize()}</div>{/if}<!--
  The same millimetres, named for what they are on this material: a cutting
  margin where scissors go, air where nothing is cut. Against a symbol size they
  are added around the card, against a card size they are taken out of it — so
  the note says which, where the number is.
-->{#if cards || strip}{@render numberOpt('opt-cut', t('ui.cut_margin'), s.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', exact ? t('ui.cut_margin_card_note') : t('ui.cut_margin_note'), (next) => set('cutMarginMm', next))}{/if}{#if board}{@render numberOpt('opt-cut', t('ui.card_air'), s.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', t('ui.card_air_note'), (next) => set('cutMarginMm', next))}{/if}{#if !list}<div class="opt">{@render check(t('ui.print_label'), s.settings.showLabel, (next) => set('showLabel', next))}{#if s.settings.showLabel}{@render segmented([
  { label: t('ui.label_below'), active: s.settings.labelPosition === 'below', onPick: () => set('labelPosition', 'below') },
  { label: t('ui.label_above'), active: s.settings.labelPosition === 'above', onPick: () => set('labelPosition', 'above') },
], 'margin-top:6px')}{@render numberOpt('opt-label', t('ui.font_size'), s.settings.labelSizePt, 5, 40, 0.5, 11, 'pt', null, (next) => set('labelSizePt', next))}{/if}</div>{/if}<div class="opt"><!-- svelte-ignore a11y_label_has_associated_control --><label>{t('ui.frame_colour')}</label>{@render check(t('ui.frame_each'), s.settings.cardBorderMm > 0, (next) => set('cardBorderMm', next ? 0.5 : 0))}<!--
  A frame around the whole sentence is a strip's alone: a card sheet has no
  sentence to frame and a Tafel is one sheet already.
-->{#if strip}{@render check(t('ui.frame_strip'), s.settings.stripFrame, (next) => set('stripFrame', next))}{/if}<!--
  Corners and colour belong to whichever frame is switched on — both are drawn
  with the same pen. Thickness is the card frame's alone: the strip takes its
  own from that number when there is one, and a line thin enough to cut along
  when there is not.
-->{#if framed}<div class="opt--pair">{#if s.settings.cardBorderMm > 0}{@render numberOpt('opt-border', t('ui.thickness'), s.settings.cardBorderMm, 0.1, 5, 0.1, 0.5, 'mm', null, (next) => set('cardBorderMm', next))}{/if}{@render numberOpt('opt-radius', t('ui.corners'), s.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', null, (next) => set('cardRadiusMm', next))}{@render colorOpt('opt-border-color', t('ui.colour'), s.settings.cardBorderColor, (next) => set('cardBorderColor', next))}</div>{/if}{@render check(t('ui.background_colour'), s.settings.cardBackground !== null, (next) => set('cardBackground', next ? DEFAULT_CARD_BACKGROUND : null))}{#if s.settings.cardBackground !== null}{@render colorOpt('opt-bg', t('ui.colour'), s.settings.cardBackground, (next) => set('cardBackground', next))}{/if}<span class="small faint">{t('ui.background_note')}</span></div><div class="opt"><!--
  Cut lines where something is cut: a card sheet, the list's cards.
-->{#if cards || list}{@render check(t('ui.cut_lines'), s.settings.showCutLines, (next) => set('showCutLines', next))}{/if}{#if strip}{@render check(t('ui.sentence_above'), s.settings.showSentenceText, (next) => set('showSentenceText', next))}{@render check(t('ui.one_per_page'), s.settings.onePerPage, (next) => set('onePerPage', next))}{/if}{#if !list}{@render check(t('ui.collection_title'), s.settings.showCollectionTitle, (next) => set('showCollectionTitle', next))}{/if}</div><!--
  METACOM only. ARASAAC's attribution is a licence condition and prints whether
  anyone asks for it or not, so offering to switch it off would be offering
  something bildhaft will not do.
-->{#if s.options.provider === 'metacom'}<div class="opt">{@render check(t('ui.print_copyright'), s.settings.showCopyright, (next) => set('showCopyright', next))}<span class="small faint">{t('ui.copyright_note', { notice: METACOM_COPYRIGHT })}</span></div>{/if}</div><div class="preview-frame" bind:this={s.frame}><div bind:this={s.sizer}><div class="preview-scaler" bind:this={s.scaler}><div style="width:fit-content" bind:this={s.holder}><PrintSheet blocks={s.blocks} plan={s.plan} settings={s.settings} provider={s.options.provider} /></div></div></div></div></div>
