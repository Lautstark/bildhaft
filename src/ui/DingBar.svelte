<script lang="ts" module>
  /* The chevron of a chip, lent to „Alle drucken" for its folding list. */
  export { dd };
</script>

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
   *
   * „Alle drucken" hands in its own `source`: the same menu, set for every
   * ticked material at once and for that print only. Where those materials
   * disagree, a box stands half ticked and a field empty, with who has what
   * under it (her pick V1, 2026-10-29) — until it is set, for all of them.
   */
  import { ANYBOOK_PLACES, PRINT_FONTS, type CollectionKind, type PrintFont, type PrintSettings } from '../core/types.ts';
  import type { Measures } from './printDialog.svelte.ts';
  import { materialPrint, type PrintMixed, type PrintSource } from '../app/print.ts';
  import { providerId } from '../app/state.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import PaletteRow from './PaletteRow.svelte';
  import { LOCALE, t } from '../i18n/index.ts';

  /* How big things come out, measured off the sheet beside this row. */
  let { measures = null, source = null }: { measures?: Measures | null; source?: PrintSource | null } = $props();

  let open = $state<'page' | 'title' | 'symbol' | 'own' | 'anybook' | null>(null);
  let host: HTMLElement | undefined = $state();

  let mp = $derived(source ?? materialPrint());
  let which = $derived(mp?.kind ?? 'satzstreifen');
  let offer = $derived(mp ? TEMPLATES[which].offers(mp.settings) : null);
  let metacom = $derived(providerId() === 'metacom');
  let gridded = $derived(offer?.size?.kind === 'cards' && mp?.settings.sheetFit === 'grid');
  /* Ein Plauderbuch stellt am Symbol nichts: dann gibt es den Chip nicht. */
  let symbolish = $derived(Boolean(offer && (offer.size || offer.label || offer.frames
    || offer.background || offer.cutLines || which === 'einkaufsliste')));
  /* Was nur diese Vorlage hat, hinter einem Chip mit ihrem Namen — der
     vierte Knopf des Mocks. Ein Rezept hat nichts Eigenes und darum keinen. */
  const OWN_NAMES: Partial<Record<CollectionKind, string>> = { satzstreifen: 'ui.ding_streifen', lied: 'ui.ding_lied', tafel: 'ui.ding_tafel', spiel: 'ui.ding_spiel', plauderbuch: 'ui.ding_plauderbuch' };
  let ownish = $derived(Boolean(offer && (offer.sentence || offer.stripFrame || offer.songChecks || offer.freeFields || offer.game || offer.talk)));
  let ownName = $derived(OWN_NAMES[which] ? t(OWN_NAMES[which]!) : '');
  let exact = $derived(offer?.size?.kind === 'cards' && mp?.settings.sheetFit === 'card');
  /* The one colour of the material, set at the title: title, its line and
     the cart follow it together. The card frames did too, until they had a
     palette of their own (2026-10-23) — a colour somebody can pick must not
     be overwritten from somewhere else. */
  const paintMaterial = (colour: string | null) =>
    mp?.patch({ titleColour: colour, cartColour: colour,
      ...(offer?.colour ? { accentColour: colour ?? '#2c66c8' } : {}) });

  const away = (event: PointerEvent) => {
    if (open && host && !host.contains(event.target as Node)) open = null;
  };
  /* A Titel or Anybook button that is off switches on as it opens (her call,
     2026-10-28): pressing it means wanting it, and an open menu with one empty
     box and nothing under it looks broken. Off is the box inside. */
  const show = (which: 'page' | 'title' | 'symbol' | 'own' | 'anybook') => {
    const opening = open !== which;
    open = opening ? which : null;
    if (!opening || !mp || !offer) return;
    if (which === 'title' && !any('showCollectionTitle')) mp.set('showCollectionTitle', true);
    if (which === 'anybook' && !any('anybookCircle') && !offer.anybookOff) mp.set('anybookCircle', true);
  };

  /* Where the ticked materials of „Alle drucken" disagree. One material never does. */
  const mixed = (key: keyof PrintSettings, as?: (value: unknown) => unknown): PrintMixed | null => mp?.mixed(key, as) ?? null;
  /* Whether any of them has it on: then what hangs under it is shown, set for all. */
  const any = (key: keyof PrintSettings): boolean => Boolean(mp?.settings[key]) || mixed(key) !== null;
  /* Pressed only where all of them have it. */
  const pressed = (key: keyof PrintSettings, value: unknown): boolean => !mixed(key) && mp?.settings[key] === value;
  const isOn = (value: unknown): boolean => value !== null && value !== undefined && value !== false && value !== 0;
  /* Who has what, under the box or field that stands undecided. */
  function why(groups: PrintMixed, unit = ''): string {
    if (groups.every((group) => typeof group.value === 'boolean')) {
      return groups.map((group) => t(group.value ? 'ui.mixed_on' : 'ui.mixed_off', { names: group.names.join(', ') })).join(' · ');
    }
    if (groups.every((group) => typeof group.value === 'number')) {
      return groups.map((group) => `${group.names.join(', ')} ${(group.value as number).toLocaleString(LOCALE)}${unit ? ` ${unit}` : ''}`).join(' · ');
    }
    return t('ui.mixed_apart', { groups: groups.map((group) => group.names.join(', ')).join(' · ') });
  }
  const note = (key: keyof PrintSettings): string | null => { const m = mixed(key); return m ? why(m) : null; };
  /* A box's own `indeterminate`, which is a property and no attribute. */
  const half = (on: boolean) => (input: HTMLInputElement) => { input.indeterminate = on; };
  const POSITIONS = ['above', 'below'] as const;

  const mm = (value: number): string => value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
  const pt = (value: number): string => (Math.round(value * 2) / 2).toLocaleString(LOCALE, { maximumFractionDigits: 1 });

  function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }
</script>

<!--
  In the capture phase, and saying so when it closed a menu: an overlay
  around this row („Alle drucken") closes on Escape too, and must not when
  the Escape was this menu's.
--><svelte:window onpointerdown={away} onkeydowncapture={(event) => { if (event.key === 'Escape' && open) { open = null; event.preventDefault(); } }} />

{#snippet dd()}<span class="ding__dd"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg></span>{/snippet}

{#snippet check(label: string, checked: boolean, onToggle: (next: boolean) => void, disabled = false, key: keyof PrintSettings | null = null)}{@const m = key ? mixed(key, isOn) : null}<label class="ding-check"><input type="checkbox" checked={checked && !m} {@attach half(Boolean(m))} {disabled} onchange={(event) => onToggle(event.currentTarget.checked)} />{label}</label>{#if m}<p class="ding__mixed small faint">{why(m)}</p>{/if}{/snippet}

{#snippet num(label: string, value: number, min: number, max: number, step: number, fallback: number, unit: string, onInput: (next: number) => void, aria?: string, key: keyof PrintSettings | null = null)}<!--
  Taken while it is typed once it is a number the field can hold — „1" on the
  way to „14" is not yet a size — and put right on the way out, the same two
  handlers the print column always had. Live, because the sheet beside it is.
-->{@const m = key ? mixed(key) : null}<label class="ding-num">{label} <input class="field" type="number" {min} {max} {step} value={m ? '' : value} placeholder={m ? '–' : undefined} aria-label={aria ?? label} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) onInput(n); }} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, min, max, fallback); event.currentTarget.value = String(n); onInput(n); }} />{#if unit}<span class="ding-num__unit">{unit}</span>{/if}</label>{#if m}<p class="ding__mixed small faint">{why(m, unit)}</p>{/if}{/snippet}

{#snippet toggled(which: 'title' | 'anybook', name: string, on: boolean, colour: string | null)}<!--
  Aus „+ Name“, gestrichelt; an „✓ Name“ mit dem Pfeil (ihre Wahl P1). Ein
  Druck auf „+“ schaltet ein und öffnet das Menü (show).
--><button class="ding__chip{on ? '' : ' ding__chip--add'}" type="button" aria-label={name} aria-expanded={open === which} onclick={() => show(which)}>{#if on}<span class="ding__ck" aria-hidden="true">✓</span>{:else}<span class="ding__plus" aria-hidden="true">+</span>{/if}{name}{#if on && colour}<span class="ding__dot" style:--c={colour}></span>{/if}{#if on}{@render dd()}{/if}</button>{/snippet}

{#snippet head(label: string, checked: boolean, onToggle: (next: boolean) => void, disabled = false, key: keyof PrintSettings | null = null)}{@const m = key ? mixed(key, isOn) : null}<label class="ding-head"><span>{label}</span><input class="ding-switch" type="checkbox" role="switch" checked={checked && !m} {@attach half(Boolean(m))} {disabled} onchange={(event) => onToggle(event.currentTarget.checked)} /></label>{#if m}<p class="ding-r__why ding__mixed small faint">{why(m)}</p>{/if}{/snippet}

{#snippet swRow(label: string, checked: boolean, onToggle: (next: boolean) => void, key: keyof PrintSettings | null = null)}{@const m = key ? mixed(key, isOn) : null}<label class="ding-r ding-r--sw"><span>{label}</span><input class="ding-switch ding-switch--sm" type="checkbox" role="switch" checked={checked && !m} {@attach half(Boolean(m))} onchange={(event) => onToggle(event.currentTarget.checked)} /></label>{#if m}<p class="ding-r__why ding__mixed small faint">{why(m)}</p>{/if}{/snippet}

{#snippet stepper(label: string, value: number, min: number, max: number, fallback: number, unit: string, onInput: (next: number) => void, key: keyof PrintSettings | null = null)}{@const m = key ? mixed(key) : null}<span class="ding-step"><button type="button" aria-label={t('ui.less_of', { what: label })} disabled={value <= min} onclick={() => onInput(Math.max(min, value - 1))}>−</button><input class="field" type="number" {min} {max} step="1" value={m ? '' : value} placeholder={m ? '–' : undefined} aria-label={label} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) onInput(n); }} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, min, max, fallback); event.currentTarget.value = String(n); onInput(n); }} /><span class="ding-step__unit">{unit}</span><button type="button" aria-label={t('ui.more_of', { what: label })} disabled={value >= max} onclick={() => onInput(Math.min(max, value + 1))}>+</button></span>{#if m}<span class="ding__mixed small faint">{why(m, unit)}</span>{/if}{/snippet}

{#if mp && offer}<div class="ding-bar" bind:this={host}>
  <span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_page')} aria-expanded={open === 'page'} onclick={() => show('page')}>{t('ui.ding_page')}{#if mp.settings.pageColour}<span class="ding__dot" style:--c={mp.settings.pageColour}></span>{/if}{@render dd()}</button>{#if open === 'page'}<div class="ding__pop" role="group" aria-label={t('ui.ding_page')}>
    <!--
      Die Schrift des ganzen Bogens, vom Titel bis zur Copyright-Zeile (2026-10-27,
      ihr Wunsch, Mock): eine für alles, keine zweite für den Titel. Jede steht
      in sich selbst geschrieben.
    -->
    <div class="palette-row" role="group" aria-label={t('ui.print_font')}><span class="palette-row__name small faint">{t('ui.print_font')}</span><span class="segmented">{#each Object.keys(PRINT_FONTS) as PrintFont[] as font (font)}<button type="button" style:font-family={PRINT_FONTS[font].family} aria-pressed={pressed('font', font)} onclick={() => mp?.set('font', font)}>{PRINT_FONTS[font].name}</button>{/each}</span></div>
    {#if offer.page}<PaletteRow label={t('ui.page_colour')} value={mp.settings.pageColour} mixed={note('pageColour')} strength="fill" none ownStart="#d9ebd3" onPick={(next) => mp?.set('pageColour', next)} />{/if}
    {#if offer.onePerPage}{@render check(t('ui.one_per_page'), mp.settings.onePerPage, (next) => mp?.set('onePerPage', next), false, 'onePerPage')}{/if}
    {#if offer.guide}{@render check(t('ui.shop_guide_print'), mp.settings.showGuide, (next) => mp?.set('showGuide', next), false, 'showGuide')}{/if}
    <!--
      Zum Lochen (2026-10-26, ihr Wunsch, Mock mit links|oben): der Rand an der
      Lochkante wird 2 cm, die Marken zeigen, wo der Locher trifft. Angehakt
      beginnt es dort, wo ein Ordner es meist will — links am Hochformat, oben
      am Querformat.
    -->
    {@render check(t('ui.punch'), mp.settings.punch !== null, (next) => mp?.set('punch', next ? (mp.settings.orientation === 'landscape' ? 'top' : 'left') : null), false, 'punch')}
    {#if any('punch')}<div class="ding__dep">
      <div class="ding__row"><span class="segmented">{#each ['left', 'top'] as const as edge (edge)}<button type="button" aria-pressed={pressed('punch', edge)} onclick={() => mp?.set('punch', edge)}>{t(edge === 'left' ? 'ui.punch_left' : 'ui.punch_top')}</button>{/each}</span></div>
      {@render check(t('ui.punch_marks'), mp.settings.punchMarks, (next) => mp?.set('punchMarks', next), false, 'punchMarks')}
    </div>{/if}
    {#if offer.pageNumbers}{@render check(t('ui.page_numbers'), mp.settings.showPageNumbers, (next) => mp?.set('showPageNumbers', next), false, 'showPageNumbers')}{/if}
    {#if metacom}{@render check(t('ui.print_copyright'), mp.settings.showCopyright, (next) => mp?.set('showCopyright', next), false, 'showCopyright')}{/if}
  </div>{/if}</span>
  {#if offer.title}<!--
    Der Titel als eigener Knopf (2026-10-28, ihr Wunsch, wie Anybook): aus
    steht „+ Titel“ gestrichelt da, wie „+ Bild“ in Bearbeiten, an „✓ Titel“
    (ihre Wahl P1). Das Menü (M1): oben der Schalter, darunter je eine Zeile,
    der Name links. Aus zeigt Bearbeiten die Titelzeile nicht: was nur fürs
    Papier da ist, steht dort nur, wenn es gedruckt wird. Die Farbe ist
    zugleich die des Materials: Einkaufswagen und Rahmen folgen ihr.
  --><span class="ding">{@render toggled('title', t('ui.ding_title'), any('showCollectionTitle'), mp.settings.titleColour)}{#if open === 'title'}<div class="ding__pop ding__pop--rows" role="group" aria-label={t('ui.ding_title')}>
    {@render head(t('ui.title_print'), mp.settings.showCollectionTitle, (next) => mp?.set('showCollectionTitle', next), false, 'showCollectionTitle')}
    {#if any('showCollectionTitle')}
      <div class="ding-r"><span class="ding-r__name">{t('ui.ding_size')}</span>{@render stepper(t('ui.font_size'), mp.settings.titleSizePt, 8, 40, 15, 'pt', (next) => mp?.set('titleSizePt', next), 'titleSizePt')}</div>
      <div class="ding-r ding-r--palette"><PaletteRow label={t('ui.colour')} value={mp.settings.titleColour} mixed={note('titleColour')} strength="frame" none ownStart="#3d7d3a" onPick={paintMaterial} /></div>
      {@render swRow(t('ui.title_line'), mp.settings.titleLine, (next) => mp?.set('titleLine', next), 'titleLine')}
      {#if offer.title === 'pages'}<div class="ding-r"><span class="ding-r__name">{t('ui.ding_where')}</span><span class="segmented">{#each [false, true] as every (every)}<button type="button" aria-pressed={pressed('titleEvery', every)} onclick={() => mp?.set('titleEvery', every)}>{every ? t('ui.title_every') : t('ui.title_first')}</button>{/each}</span></div>{/if}
    {/if}
  </div>{/if}</span>{/if}
  {#if symbolish}<span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_symbol')} aria-expanded={open === 'symbol'} onclick={() => show('symbol')}>{t('ui.ding_symbol')}{@render dd()}</button>{#if open === 'symbol'}<div class="ding__pop" role="group" aria-label={t('ui.ding_symbol')}>
    {#if measures}<!--
      Die Messzeile (2026-10-27, ihr Mock): in jeder Vorlage hier zuoberst und
      gleich — wie groß Symbol, Karte und Wort aus dem Drucker kommen,
      gemessen am Blatt nebenan, gleich wer die Größe bestimmt.
    --><p class="ding__mess{measures.tooBig ? ' ding__mess--warn' : ''}" aria-live="polite">{#if measures.tooBig}{t('ui.card_too_big')}{:else}{#if measures.symbolMm !== null}<span>{t('ui.measure_symbol', { mm: mm(measures.symbolMm) })}</span>{/if}{#if measures.card}<span>{t('ui.measure_card', { w: mm(measures.card.w), h: mm(measures.card.h) })}</span>{/if}{#if measures.labelPt !== null}<span>{t('ui.measure_label', { pt: pt(measures.labelPt) })}</span>{/if}{/if}</p>{/if}
    {#if offer.background || which === 'einkaufsliste'}<PaletteRow label={t('ui.cards_fill')} value={mp.settings.cardBackground} mixed={note('cardBackground')} strength="fill" none ownStart="#fff1b3" onPick={(next) => mp?.set('cardBackground', next)} />{/if}
    {#if offer.size?.kind === 'cards'}
      <div class="ding__row"><span class="segmented">
        <button type="button" aria-pressed={!gridded && !exact && !mixed('sheetFit')} onclick={() => mp?.set('sheetFit', 'size')}>{t('ui.fit_symbol')}</button>
        <button type="button" aria-pressed={exact && !mixed('sheetFit')} onclick={() => mp?.set('sheetFit', 'card')}>{t('ui.fit_card')}</button>
        <button type="button" aria-pressed={gridded && !mixed('sheetFit')} onclick={() => mp?.set('sheetFit', 'grid')}>{t('ui.grid')}</button>
      </span></div>
      {#if exact}<div class="ding__row">{@render num(t('ui.card_width'), mp.settings.cardWidthMm, 15, 300, 1, 60, 'mm', (next) => mp?.set('cardWidthMm', next), undefined, 'cardWidthMm')}<label class="ding-num">{t('ui.card_height')} <input class="field" type="number" min="15" max="300" step="1" value={mp.settings.cardHeightMm ?? ''} placeholder={String(mp.settings.cardWidthMm)} aria-label={t('ui.card_height')} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= 15 && n <= 300) mp?.set('cardHeightMm', n); }} onchange={(event) => { if (event.currentTarget.value.trim() === '') { mp?.set('cardHeightMm', null); return; } const n = clamp(event.currentTarget.valueAsNumber, 15, 300, 15); event.currentTarget.value = String(n); mp?.set('cardHeightMm', n); }} /><span class="ding-num__unit">mm</span></label></div>
      {:else if gridded}<div class="ding__row">{@render num(t('ui.columns'), mp.settings.gridCols, 1, 12, 1, 4, '', (next) => mp?.set('gridCols', Math.round(next)), undefined, 'gridCols')}{@render num(t('ui.rows'), mp.settings.gridRows, 1, 12, 1, 3, '', (next) => mp?.set('gridRows', Math.round(next)), undefined, 'gridRows')}</div>
      {:else}{@render num(t('ui.symbol_size'), mp.settings.symbolSizeMm, 10, 120, 1, 40, 'mm', (next) => mp?.set('symbolSizeMm', next), undefined, 'symbolSizeMm')}{/if}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next), undefined, 'cutMarginMm')}
    {:else if offer.size?.kind === 'symbol'}
      {@render num(t('ui.symbol_size'), mp.settings.symbolSizeMm, 10, offer.size.max, 1, offer.size.fallback, 'mm', (next) => mp?.set('symbolSizeMm', next), undefined, 'symbolSizeMm')}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next), undefined, 'cutMarginMm')}
    {:else if offer.size?.kind === 'board'}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next), undefined, 'cutMarginMm')}
    {/if}
    {#if offer.label}{@render check(t('ui.print_label'), mp.settings.showLabel, (next) => mp?.set('showLabel', next), false, 'showLabel')}{#if any('showLabel')}<div class="ding__sub"><span class="segmented">{#each POSITIONS as where (where)}<button type="button" aria-pressed={pressed('labelPosition', where)} onclick={() => mp?.set('labelPosition', where)}>{where === 'above' ? t('ui.label_above') : t('ui.label_below')}</button>{/each}</span>{@render num(t('ui.font_size'), mp.settings.labelSizePt, 5, 40, 0.5, 11, 'pt', (next) => mp?.set('labelSizePt', next), t('ui.label_size'), 'labelSizePt')}</div>{/if}
    {/if}
    {#if offer.frames || which === 'einkaufsliste'}{@render check(t('ui.frame_each'), mp.settings.cardBorderMm > 0, (next) => mp?.set('cardBorderMm', next ? 0.5 : 0), false, 'cardBorderMm')}{/if}
    {#if any('cardBorderMm')}<div class="ding__dep">
      <div class="ding__row">{@render num(t('ui.thickness'), mp.settings.cardBorderMm > 0 ? mp.settings.cardBorderMm : 0.5, 0.1, 5, 0.1, 0.5, 'mm', (next) => mp?.set('cardBorderMm', next), undefined, 'cardBorderMm')}{@render num(t('ui.corners'), mp.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', (next) => mp?.set('cardRadiusMm', next), undefined, 'cardRadiusMm')}</div>
      <PaletteRow label={t('ui.colour')} value={mp.settings.cardBorderColor} mixed={note('cardBorderColor')} strength="frame" ownStart="#333333" onPick={(next) => mp?.set('cardBorderColor', next ?? '#333333')} />
    </div>{/if}
    {#if offer.cutLines || which === 'einkaufsliste'}{@render check(t('ui.cut_lines'), mp.settings.showCutLines, (next) => mp?.set('showCutLines', next), false, 'showCutLines')}{/if}
  </div>{/if}</span>{/if}
  {#if ownish && ownName}<span class="ding"><button class="ding__chip" type="button" aria-label={ownName} aria-expanded={open === 'own'} onclick={() => show('own')}>{ownName}{#if offer.talk}{#if mp.settings.gameGroundColour}<span class="ding__dot" style:--c={mp.settings.gameGroundColour}></span>{/if}<span class="ding__dot" style:--c={mp.settings.accentColour}></span>{/if}{@render dd()}</button>{#if open === 'own'}<div class="ding__pop" role="group" aria-label={ownName}>
    {#if offer.sentence}{@render check(t('ui.print_sentence'), mp.settings.showSentenceText, (next) => mp?.set('showSentenceText', next), false, 'showSentenceText')}{#if any('showSentenceText')}<div class="ding__dep"><div class="ding__row"><span class="segmented">{#each POSITIONS as where (where)}<button type="button" aria-pressed={pressed('sentencePosition', where)} onclick={() => mp?.set('sentencePosition', where)}>{where === 'above' ? t('ui.label_above') : t('ui.label_below')}</button>{/each}</span>{@render num(t('ui.font_size'), mp.settings.sentenceSizePt, 5, 40, 0.5, 10, 'pt', (next) => mp?.set('sentenceSizePt', next), t('ui.sentence_size'), 'sentenceSizePt')}</div></div>{/if}{/if}
    {#if offer.stripFrame}{@render check(t('ui.frame_strip'), mp.settings.stripFrame, (next) => mp?.set('stripFrame', next), false, 'stripFrame')}{#if any('stripFrame')}<div class="ding__dep"><div class="ding__row">{@render num(t('ui.thickness'), mp.settings.cardBorderMm > 0 ? mp.settings.cardBorderMm : 0.5, 0.1, 5, 0.1, 0.5, 'mm', (next) => mp?.set('cardBorderMm', next), undefined, 'cardBorderMm')}{@render num(t('ui.corners'), mp.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', (next) => mp?.set('cardRadiusMm', next), undefined, 'cardRadiusMm')}</div><PaletteRow label={t('ui.colour')} value={mp.settings.cardBorderColor} mixed={note('cardBorderColor')} strength="frame" ownStart="#333333" onPick={(next) => mp?.set('cardBorderColor', next ?? '#333333')} /></div>{/if}{/if}
    {#if offer.songChecks}{@render check(t('ui.song_headings'), mp.settings.songHeadings, (next) => mp?.set('songHeadings', next), false, 'songHeadings')}
    {@render check(t('ui.song_repeats'), mp.settings.songRepeats, (next) => mp?.set('songRepeats', next), false, 'songRepeats')}
    {@render check(t('ui.song_refrain_once'), mp.settings.songRefrainOnce, (next) => mp?.set('songRefrainOnce', next), false, 'songRefrainOnce')}{/if}
    {#if offer.freeFields}{@render check(t('ui.free_fields_dashed'), mp.settings.markFreeFields, (next) => mp?.set('markFreeFields', next), false, 'markFreeFields')}{/if}
    {#if offer.game}<!--
      Die zwei Farben des Spiels: der Grund hinter jeder Zeile (Aus druckt sie
      nackt) und der Akzent, der die gedruckten Karten rahmt und die
      gestrichelten Felder zeichnet.
    --><PaletteRow label={t('ui.game_ground')} value={mp.settings.gameGroundColour} mixed={note('gameGroundColour')} strength="fill" none ownStart="#fdeef3" onPick={(next) => mp?.set('gameGroundColour', next)} />
    <PaletteRow label={t('ui.game_accent')} value={mp.settings.accentColour} mixed={note('accentColour')} strength="frame" ownStart="#e0558c" onPick={(next) => mp?.set('accentColour', next ?? '#e0558c')} />{/if}
    {#if offer.talk}<!--
      Die zwei Farben des Plauderbuchs, gespeichert wie die des Spiels: das
      Band der Frage (blasser die Felder; Aus druckt es nackt, die Felder grau)
      und die Linie um das freie Feld.
    --><PaletteRow label={t('ui.talk_band')} value={mp.settings.gameGroundColour} mixed={note('gameGroundColour')} strength="fill" none ownStart="#d8e9fc" onPick={(next) => mp?.set('gameGroundColour', next)} />
    <PaletteRow label={t('ui.talk_line')} value={mp.settings.accentColour} mixed={note('accentColour')} strength="frame" ownStart="#3f88e0" onPick={(next) => mp?.set('accentColour', next ?? '#3f88e0')} />{/if}
  </div>{/if}</span>{/if}
  <!--
    Anybook als eigener Knopf (2026-10-28, ihr Wunsch): er ist der eine
    Schalter. An, zeigt Bearbeiten bei allem, was einen Code bekommt, was der
    Stift sagt; aus, nichts davon — gelöscht wird dabei nichts, eigene Worte
    und entfernte Codes sind beim Wiedereinschalten wieder da. Wo der Sticker
    sitzt, zeigen acht kleine Karten (ihr Mock): vier neben dem Bild, vier
    auf der Ecke; wo das Feld fest ist (Spiel, Plauderbuch), nur die Ecken.
  --><span class="ding">{@render toggled('anybook', t('ui.ding_anybook'), any('anybookCircle'), null)}{#if open === 'anybook'}<div class="ding__pop ding__pop--rows" role="group" aria-label={t('ui.ding_anybook')}>
    {@render head(t('ui.anybook_circle'), mp.settings.anybookCircle, (next) => mp?.set('anybookCircle', next), !!offer.anybookOff, 'anybookCircle')}
    {#if offer.anybookOff}<p class="ding-r__why small faint">{t(offer.anybookOff)}</p>{/if}
    {#if any('anybookCircle')}
      {@const places = offer.anybookPlaces ?? ANYBOOK_PLACES}
      {#if places.length > 1}<div class="ding-r ding-r--top"><span class="ding-r__name">{t('ui.anybook_place')}</span><div class="any-tiles" role="radiogroup" aria-label={t('ui.anybook_place')}>{#each places as place (place)}<button class="any-tile any-tile--{place}" type="button" role="radio" aria-checked={pressed('anybookPlace', place)} aria-label={t(`ui.anybook_${place}`)} title={t(`ui.anybook_${place}`)} onclick={() => mp?.set('anybookPlace', place)}><span class="any-tile__pic"></span><span class="any-tile__dot"></span></button>{/each}<span class="any-tiles__name small">{t(`ui.anybook_${mp.settings.anybookPlace}`)}</span></div></div>{/if}
      {@render swRow(t('ui.anybook_activation'), mp.settings.anybookActivation === true, (next) => mp?.set('anybookActivation', next ? true : undefined), 'anybookActivation')}
      {#if mp.settings.anybookOff?.length}<!-- Wo Codes weggenommen sind, sagt es auch das Menü (ihr Wunsch): in Bearbeiten ist ihr Feld rot. --><p class="ding-r__foot small">{t(mp.settings.anybookOff.length === 1 ? 'ui.anybook_off_one' : 'ui.anybook_off_n', { n: mp.settings.anybookOff.length })}</p>{/if}
    {/if}
  </div>{/if}</span>
</div>{/if}
