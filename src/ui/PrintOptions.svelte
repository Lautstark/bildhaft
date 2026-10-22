<script lang="ts">
  /**
   * What a material can be asked about its paper, in one order for every
   * template: Papier, Größe, Gestaltung, a group named after the template for
   * what only it has, and the Fußzeile last.
   *
   * Which controls a material has is its template's to say (`offers` in
   * app/templates.ts); where they stand and how they look is said here, once,
   * for all of them — so the same control is in the same place in every
   * template, and one a material does not have is not greyed out, it is not
   * there. Drawn in the column beside the Sammlung; every change goes to the
   * Sammlung and to the preview above it at once.
   */
  import type { PrintSettings } from '../core/types.ts';
  import type { Snippet } from 'svelte';
  import { METACOM_COPYRIGHT, titleColour } from './printSheet.ts';
  import type { Printing } from './printDialog.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Printing } = $props();

  /** What "give the cards a background" starts as before anyone picks a colour. */
  const DEFAULT_CARD_BACKGROUND = '#fff3bf';
  const DEFAULT_PAGE_COLOUR = '#a9cbec';
  /* An Einkaufsliste's page green, as templates.ts opens it. */
  const SHOP_PAGE = '#d9ebd3';
  /* The grey an Einkaufsliste's cart is drawn in until it is given a colour; print.css's. */
  const CART_GREY = '#b4b9be';

  function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  let offer = $derived(TEMPLATES[s.options.kind].offers(s.settings));
  let size = $derived(offer.size ?? null);
  let cards = $derived(size?.kind === 'cards');
  let gridded = $derived(cards && s.settings.sheetFit === 'grid');
  /* The card named in millimetres, which only a card sheet can be asked. */
  let exact = $derived(cards && s.settings.sheetFit === 'card');
  let framed = $derived(s.settings.cardBorderMm > 0 || (Boolean(offer.stripFrame) && s.settings.stripFrame));
  /*
   * The options, in the one order every template draws them in, each with the
   * group it stands under and when it is there at all. A group's heading is
   * drawn when something under it is — worked out from this list rather than
   * asked a second time, so a heading can never stand over nothing, nor an
   * option without its heading.
   */
  type Group = 'paper' | 'size' | 'look' | 'own' | 'foot';
  /* The groups in their order, each with its heading: the base, then what
     only this template has under its name, and the foot of the page last. */
  const GROUPS: Record<Group, () => string> = {
    paper: () => t('ui.group_paper'), size: () => t('ui.group_size'), look: () => t('ui.group_look'),
    own: () => t(`ui.template_${s.options.kind}`), foot: () => t('ui.group_foot'),
  };
  /* A setting that is on or off. */
  type Switch = { [K in keyof PrintSettings]: PrintSettings[K] extends boolean ? K : never }[keyof PrintSettings];
  /* An option is drawn by its own snippet, or — when it is one check — named
     by its setting and its label and drawn by `toggleOpt`. */
  type Option = { group: Group; shown: () => boolean } & ({ draw: Snippet } | { toggle: Switch; label: string });
  const OPTIONS: Option[] = [
    { group: 'paper', shown: () => Boolean(offer.paper), draw: paperOpt },
    { group: 'size', shown: () => cards, draw: cardsOpt },
    { group: 'size', shown: () => size?.kind === 'symbol', draw: symbolOpt },
    { group: 'size', shown: () => size?.kind === 'board', draw: boardOpt },
    { group: 'size', shown: () => Boolean(offer.margin), draw: marginOpt },
    { group: 'look', shown: () => Boolean(offer.title), draw: titleOpt },
    { group: 'look', shown: () => Boolean(offer.label), draw: labelOpt },
    { group: 'look', shown: () => Boolean(offer.frames), draw: framesOpt },
    { group: 'look', shown: () => Boolean(offer.background), draw: backgroundOpt },
    { group: 'look', shown: () => Boolean(offer.page), draw: pageColourOpt },
    { group: 'foot', shown: () => Boolean(offer.pageNumbers), toggle: 'showPageNumbers', label: 'ui.page_numbers' },
    { group: 'foot', shown: () => s.options.provider === 'metacom', draw: copyrightOpt },
    { group: 'own', shown: () => Boolean(offer.colour), draw: colourOpt },
    { group: 'own', shown: () => Boolean(offer.sentence), draw: sentenceOpt },
    { group: 'own', shown: () => Boolean(offer.stripFrame), toggle: 'stripFrame', label: 'ui.frame_strip' },
    { group: 'own', shown: () => Boolean(offer.onePerPage), toggle: 'onePerPage', label: 'ui.one_per_page' },
    { group: 'own', shown: () => Boolean(offer.cutLines), toggle: 'showCutLines', label: 'ui.cut_lines' },
    { group: 'own', shown: () => Boolean(offer.freeFields), toggle: 'markFreeFields', label: 'ui.free_fields_dashed' },
    { group: 'own', shown: () => Boolean(offer.songChecks), draw: songChecksOpt },
    { group: 'own', shown: () => Boolean(offer.cart), draw: cartOpt },
    { group: 'own', shown: () => Boolean(offer.guide), toggle: 'showGuide', label: 'ui.shop_guide_print' },
  ];
  let groups = $derived((Object.keys(GROUPS) as Group[])
    .map((group) => ({ heading: GROUPS[group](), options: OPTIONS.filter((one) => one.group === group && one.shown()) }))
    .filter((one) => one.options.length > 0));

  const set = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => s.set(key, value);

  /* A number is taken while it is typed only once it is one this field can
     hold — „1" on the way to „14" is not yet a size, and clamping it to 10
     on the spot turned „14" into „104". Out of range, it is put right when
     the field is left. And the wheel scrolls the column: over a focused
     number field it used to turn the number instead, a size changing under
     somebody who was only scrolling. */
  function leaveOnWheel(event: WheelEvent): void {
    const field = event.currentTarget as HTMLInputElement;
    if (document.activeElement === field) field.blur();
  }

</script>

{#snippet numberField(id: string, label: string, value: number, min: number, max: number, step: number, fallback: number, unit: string, onInput: (next: number) => void)}<div class="opt__row"><input class="field" {id} type="number" {min} {max} {step} {value} aria-label={label} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) onInput(n); }} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, min, max, fallback); event.currentTarget.value = String(n); onInput(n); }} onwheel={leaveOnWheel} /><span class="opt__unit">{unit}</span></div>{/snippet}

{#snippet numberOpt(id: string, label: string, value: number, min: number, max: number, step: number, fallback: number, unit: string, hint: string | null, onInput: (next: number) => void, extra?: Snippet)}<div class="opt"><label for={id}>{label}</label>{@render numberField(id, label, value, min, max, step, fallback, unit, onInput)}{#if hint !== null}<span class="small faint">{hint}</span>{:else if extra}{@render extra()}{/if}</div>{/snippet}

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
{#snippet cardHeightOpt()}<div class="opt"><label for="opt-card-h">{t('ui.card_height')}</label><div class="opt__row"><input class="field" id="opt-card-h" type="number" min="15" max="300" step="1" value={s.settings.cardHeightMm ?? ''} placeholder={String(s.settings.cardWidthMm)} aria-label={t('ui.card_height')} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= 15 && n <= 300) set('cardHeightMm', n); }} onchange={(event) => { if (event.currentTarget.value.trim() === '') { set('cardHeightMm', null); return; } const n = clamp(event.currentTarget.valueAsNumber, 15, 300, 15); event.currentTarget.value = String(n); set('cardHeightMm', n); }} onwheel={leaveOnWheel} /><span class="opt__unit">mm</span></div><span class="small faint">{t('ui.card_height_hint')}</span></div>{/snippet}


{#snippet group(name: string)}<h3 class="opt-group">{name}</h3>{/snippet}

{#snippet paperOpt()}<div class="opt">{@render segmented([
  { label: 'A5', active: s.settings.paper === 'a5', onPick: () => set('paper', 'a5') },
  { label: 'A4', active: s.settings.paper === 'a4', onPick: () => set('paper', 'a4') },
  { label: 'A3', active: s.settings.paper === 'a3', onPick: () => set('paper', 'a3') },
], '')}{#if offer.paper === true}{@render segmented([
  { label: t('ui.portrait'), active: s.settings.orientation === 'portrait', onPick: () => set('orientation', 'portrait') },
  { label: t('ui.landscape'), active: s.settings.orientation === 'landscape', onPick: () => set('orientation', 'landscape') },
], 'margin-top:6px')}{/if}<!--
  A material whose paper decides its size says what that size comes to here,
  having no size of its own to say it under.
-->{#if !size}{@render cardSize()}{/if}</div>{/snippet}

{#snippet cardsOpt()}<div class="opt">{@render segmented([
  { label: t('ui.fit_symbol'), active: !gridded && !exact, onPick: () => set('sheetFit', 'size') },
  { label: t('ui.fit_card'), active: exact, onPick: () => set('sheetFit', 'card') },
  { label: t('ui.grid'), active: gridded, onPick: () => set('sheetFit', 'grid') },
], '')}<span class="small faint">{gridded ? t('ui.grid_note') : exact ? t('ui.card_note') : t('ui.fixed_note')}</span></div>{#if exact}<div class="opt"><div class="opt--pair">{@render numberOpt('opt-card-w', t('ui.card_width'), s.settings.cardWidthMm, 15, 300, 1, 60, 'mm', null, (next) => set('cardWidthMm', next))}{@render cardHeightOpt()}</div>{@render cardSize()}</div>{/if}{#if gridded}<div class="opt"><div class="opt--pair">{@render numberOpt('opt-cols', t('ui.columns'), s.settings.gridCols, 1, 12, 1, 4, '', null, (next) => set('gridCols', Math.round(next)))}{@render numberOpt('opt-rows', t('ui.rows'), s.settings.gridRows, 1, 12, 1, 3, '', null, (next) => set('gridRows', Math.round(next)))}</div>{@render cardSize()}</div>{/if}{#if !gridded && !exact}{@render numberOpt('opt-size', t('ui.symbol_size'), s.settings.symbolSizeMm, 10, 120, 1, 40, 'mm', null, (next) => set('symbolSizeMm', next), cardSize)}{/if}{/snippet}

{#snippet symbolOpt()}{#if size?.kind === 'symbol'}{@render numberOpt('opt-size', t('ui.symbol_size'), s.settings.symbolSizeMm, 10, size.max, 1, size.fallback, 'mm', size.note ? t(size.note) : null, (next) => set('symbolSizeMm', next), size.cut === false ? undefined : cardSize)}{/if}{/snippet}

{#snippet boardOpt()}<div class="opt">{@render cardSize()}</div>{/snippet}

{#snippet marginOpt()}<!--
  The same millimetres, always „Rand", and under it what it is round on this
  material: a symbol in a strip, a card to be cut and laminated, a card in its
  field. Against a symbol size they are added around the card, against a card
  size they are taken out of it — so the note says which, where the number is.
-->{@render numberOpt('opt-cut', t('ui.margin'), s.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', offer.margin === 'strip' ? t('ui.margin_strip_note') : offer.margin === 'air' ? t('ui.margin_air_note') : offer.margin === 'symbol' ? t('ui.margin_symbol_note') : exact ? t('ui.cut_margin_card_note') : t('ui.cut_margin_note'), (next) => set('cutMarginMm', next))}{/snippet}

{#snippet titleOpt()}<!--
  Whether the title prints, as the label is asked; once it does, where — only
  with more than one page to choose from, so not on a Tafel or an
  Einkaufsliste — then how big, which colour, and a line under it. Nothing
  about what it says: that is written in Bearbeiten.
--><div class="opt">{@render check(t('ui.title_print'), s.settings.showCollectionTitle, (next) => set('showCollectionTitle', next))}{#if s.settings.showCollectionTitle}<div class="opt__sub">{#if offer.title === 'pages'}{@render segmented([
  { label: t('ui.title_first'), active: !s.settings.titleEvery, onPick: () => set('titleEvery', false) },
  { label: t('ui.title_every'), active: s.settings.titleEvery, onPick: () => set('titleEvery', true) },
], '')}{/if}{@render numberField('opt-title-size', t('ui.title_size'), s.settings.titleSizePt, 8, 40, 1, 12, 'pt', (next) => set('titleSizePt', next))}<input class="swatch" id="opt-title-colour" type="color" value={titleColour(s.settings)} aria-label={t('ui.title_colour')} oninput={(event) => set('titleColour', event.currentTarget.value)} />{@render check(t('ui.title_line'), s.settings.titleLine, (next) => set('titleLine', next))}</div>{/if}</div>{/snippet}

{#snippet colourOpt()}{@render colorOpt('opt-colour', t('ui.colour'), s.settings.accentColour, (next) => set('accentColour', next))}{/snippet}

{#snippet pageColourOpt()}<!--
  A colour behind the whole page: whether, then which, as a card's
  background is asked.
--><div class="opt">{@render check(t('ui.page_colour'), s.settings.pageColour !== null, (next) => set('pageColour', next ? (s.settings.layout === 'einkaufsliste' ? SHOP_PAGE : DEFAULT_PAGE_COLOUR) : null))}{#if s.settings.pageColour !== null}{@render colorOpt('opt-page', t('ui.colour'), s.settings.pageColour, (next) => set('pageColour', next))}{/if}</div>{/snippet}

{#snippet cartOpt()}{@render colorOpt('opt-cart', t('ui.cart_colour'), s.settings.cartColour ?? CART_GREY, (next) => set('cartColour', next))}{/snippet}

{#snippet labelOpt()}<!--
  The word on each card, and the sentence over a row (sentenceOpt), are built
  alike: whether, then — once it prints — where and how big, in one line
  under the check.
--><div class="opt">{@render check(t('ui.print_label'), s.settings.showLabel, (next) => set('showLabel', next))}{#if s.settings.showLabel}<div class="opt__sub">{@render segmented([
  { label: t('ui.label_above'), active: s.settings.labelPosition === 'above', onPick: () => set('labelPosition', 'above') },
  { label: t('ui.label_below'), active: s.settings.labelPosition === 'below', onPick: () => set('labelPosition', 'below') },
], '')}{@render numberField('opt-label', t('ui.label_size'), s.settings.labelSizePt, 5, 40, 0.5, 11, 'pt', (next) => set('labelSizePt', next))}</div>{/if}</div>{/snippet}

{#snippet sentenceOpt()}<div class="opt">{@render check(t('ui.print_sentence'), s.settings.showSentenceText, (next) => set('showSentenceText', next))}{#if s.settings.showSentenceText}<div class="opt__sub">{@render segmented([
  { label: t('ui.label_above'), active: s.settings.sentencePosition === 'above', onPick: () => set('sentencePosition', 'above') },
  { label: t('ui.label_below'), active: s.settings.sentencePosition === 'below', onPick: () => set('sentencePosition', 'below') },
], '')}{@render numberField('opt-sentence', t('ui.sentence_size'), s.settings.sentenceSizePt, 5, 40, 0.5, 10, 'pt', (next) => set('sentenceSizePt', next))}</div>{/if}</div>{/snippet}

{#snippet framesOpt()}<div class="opt">{@render check(t('ui.frame_each'), s.settings.cardBorderMm > 0, (next) => set('cardBorderMm', next ? 0.5 : 0))}<!--
  Corners and colour belong to whichever frame is switched on — both are drawn
  with the same pen. Thickness is the card frame's alone: the strip takes its
  own from that number when there is one, and a line thin enough to cut along
  when there is not.
-->{#if framed}<div class="opt--pair">{#if s.settings.cardBorderMm > 0}{@render numberOpt('opt-border', t('ui.thickness'), s.settings.cardBorderMm, 0.1, 5, 0.1, 0.5, 'mm', null, (next) => set('cardBorderMm', next))}{/if}{@render numberOpt('opt-radius', t('ui.corners'), s.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', null, (next) => set('cardRadiusMm', next))}{@render colorOpt('opt-border-color', t('ui.colour'), s.settings.cardBorderColor, (next) => set('cardBorderColor', next))}</div>{/if}</div>{/snippet}

{#snippet backgroundOpt()}<div class="opt">{@render check(t('ui.background_colour'), s.settings.cardBackground !== null, (next) => set('cardBackground', next ? DEFAULT_CARD_BACKGROUND : null))}{#if s.settings.cardBackground !== null}{@render colorOpt('opt-bg', t('ui.colour'), s.settings.cardBackground, (next) => set('cardBackground', next))}{/if}</div>{/snippet}

{#snippet toggleOpt(key: Switch, label: string)}<div class="opt">{@render check(t(label), s.settings[key], (next) => set(key, next))}</div>{/snippet}

{#snippet songChecksOpt()}<div class="opt">{@render check(t('ui.song_headings'), s.settings.songHeadings, (next) => set('songHeadings', next))}{@render check(t('ui.song_repeats'), s.settings.songRepeats, (next) => set('songRepeats', next))}{@render check(t('ui.song_refrain_once'), s.settings.songRefrainOnce, (next) => set('songRefrainOnce', next))}</div>{/snippet}

{#snippet copyrightOpt()}<!--
  METACOM only. ARASAAC's attribution is a licence condition and prints whether
  anyone asks for it or not, so offering to switch it off would be offering
  something bildhaft will not do.
--><div class="opt">{@render check(t('ui.print_copyright'), s.settings.showCopyright, (next) => set('showCopyright', next))}<span class="small faint">{t('ui.copyright_note', { notice: METACOM_COPYRIGHT })}</span></div>{/snippet}

<div class="print-options">{#each groups as { heading, options } (heading)}{@render group(heading)}{#each options as option, i (i)}{#if 'toggle' in option}{@render toggleOpt(option.toggle, option.label)}{:else}{@render option.draw()}{/if}{/each}{/each}</div>
