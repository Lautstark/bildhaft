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
  import { ANYBOOK_PLACES, PRINT_FONTS, type CollectionKind, type PrintFont } from '../core/types.ts';
  import type { Measures } from './printDialog.svelte.ts';
  import { materialPrint } from '../app/print.ts';
  import { kind, providerId } from '../app/state.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import PaletteRow from './PaletteRow.svelte';
  import { LOCALE, t } from '../i18n/index.ts';

  /* How big things come out, measured off the sheet beside this row. */
  let { measures = null }: { measures?: Measures | null } = $props();

  let open = $state<'page' | 'symbol' | 'own' | null>(null);
  let host: HTMLElement | undefined = $state();

  let mp = $derived(materialPrint());
  let offer = $derived(mp ? TEMPLATES[kind()].offers(mp.settings) : null);
  let metacom = $derived(providerId() === 'metacom');
  let gridded = $derived(offer?.size?.kind === 'cards' && mp?.settings.sheetFit === 'grid');
  /* Ein Plauderbuch stellt am Symbol nichts: dann gibt es den Chip nicht. */
  let symbolish = $derived(Boolean(offer && (offer.size || offer.label || offer.frames
    || offer.background || offer.cutLines || kind() === 'einkaufsliste')));
  /* Was nur diese Vorlage hat, hinter einem Chip mit ihrem Namen — der
     vierte Knopf des Mocks. Ein Rezept hat nichts Eigenes und darum keinen. */
  const OWN_NAMES: Partial<Record<CollectionKind, string>> = { satzstreifen: 'ui.ding_streifen', lied: 'ui.ding_lied', tafel: 'ui.ding_tafel', spiel: 'ui.ding_spiel', plauderbuch: 'ui.ding_plauderbuch' };
  let ownish = $derived(Boolean(offer && (offer.sentence || offer.stripFrame || offer.songChecks || offer.freeFields || offer.game || offer.talk)));
  let ownName = $derived(OWN_NAMES[kind()] ? t(OWN_NAMES[kind()]!) : '');
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
  const show = (which: 'page' | 'symbol' | 'own') => { open = open === which ? null : which; };
  const POSITIONS = ['above', 'below'] as const;

  const mm = (value: number): string => value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
  const pt = (value: number): string => (Math.round(value * 2) / 2).toLocaleString(LOCALE, { maximumFractionDigits: 1 });

  function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') open = null; }} />

{#snippet dd()}<span class="ding__dd"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg></span>{/snippet}

{#snippet check(label: string, checked: boolean, onToggle: (next: boolean) => void, disabled = false)}<label class="ding-check"><input type="checkbox" {checked} {disabled} onchange={(event) => onToggle(event.currentTarget.checked)} />{label}</label>{/snippet}

{#snippet num(label: string, value: number, min: number, max: number, step: number, fallback: number, unit: string, onInput: (next: number) => void, aria?: string)}<!--
  Taken while it is typed once it is a number the field can hold — „1" on the
  way to „14" is not yet a size — and put right on the way out, the same two
  handlers the print column always had. Live, because the sheet beside it is.
--><label class="ding-num">{label} <input class="field" type="number" {min} {max} {step} {value} aria-label={aria ?? label} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) onInput(n); }} onchange={(event) => { const n = clamp(event.currentTarget.valueAsNumber, min, max, fallback); event.currentTarget.value = String(n); onInput(n); }} />{#if unit}<span class="ding-num__unit">{unit}</span>{/if}</label>{/snippet}

{#if mp && offer}<div class="ding-bar" bind:this={host}>
  <span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_page')} aria-expanded={open === 'page'} onclick={() => show('page')}>{t('ui.ding_page')}{#if mp.settings.pageColour}<span class="ding__dot" style:--c={mp.settings.pageColour}></span>{/if}{@render dd()}</button>{#if open === 'page'}<div class="ding__pop" role="group" aria-label={t('ui.ding_page')}>
    <!--
      Die Schrift des ganzen Bogens, vom Titel bis zur Copyright-Zeile (2026-10-27,
      ihr Wunsch, Mock): eine für alles, keine zweite für den Titel. Jede steht
      in sich selbst geschrieben.
    -->
    <div class="palette-row" role="group" aria-label={t('ui.print_font')}><span class="palette-row__name small faint">{t('ui.print_font')}</span><span class="segmented">{#each Object.keys(PRINT_FONTS) as PrintFont[] as font (font)}<button type="button" style:font-family={PRINT_FONTS[font].family} aria-pressed={mp.settings.font === font} onclick={() => mp?.set('font', font)}>{PRINT_FONTS[font].name}</button>{/each}</span></div>
    {#if offer.page}<PaletteRow label={t('ui.page_colour')} value={mp.settings.pageColour} strength="fill" none ownStart="#d9ebd3" onPick={(next) => mp?.set('pageColour', next)} />{/if}
    {#if offer.title}<!--
      Der Titel steht oben auf der Seite, also wohnt er hier (2026-10-23, ihr
      Wunsch): alles Titelhafte — Größe, Farbe, Linie, Erste/Jede — hängt am
      Haken, ganz oder gar nicht. Die Farbe ist zugleich die des Materials:
      Einkaufswagen und Rahmen folgen ihr, bis der Rahmen eine eigene bekommt.
    -->
    {@render check(t('ui.title_print'), mp.settings.showCollectionTitle, (next) => mp?.set('showCollectionTitle', next))}
    {#if mp.settings.showCollectionTitle}<div class="ding__dep">
      {@render num(t('ui.font_size'), mp.settings.titleSizePt, 8, 40, 1, 15, 'pt', (next) => mp?.set('titleSizePt', next))}
      <PaletteRow label={t('ui.colour')} value={mp.settings.titleColour} strength="frame" none ownStart="#3d7d3a" onPick={paintMaterial} />
      {@render check(t('ui.title_line'), mp.settings.titleLine, (next) => mp?.set('titleLine', next))}
      {#if offer.title === 'pages'}<div class="ding__row"><span class="segmented">{#each [false, true] as every (every)}<button type="button" aria-pressed={mp.settings.titleEvery === every} onclick={() => mp?.set('titleEvery', every)}>{every ? t('ui.title_every') : t('ui.title_first')}</button>{/each}</span></div>{/if}
    </div>{/if}
    {/if}
    {#if offer.onePerPage}{@render check(t('ui.one_per_page'), mp.settings.onePerPage, (next) => mp?.set('onePerPage', next))}{/if}
    {#if offer.guide}{@render check(t('ui.shop_guide_print'), mp.settings.showGuide, (next) => mp?.set('showGuide', next))}{/if}
    <!--
      Zum Lochen (2026-10-26, ihr Wunsch, Mock mit links|oben): der Rand an der
      Lochkante wird 2 cm, die Marken zeigen, wo der Locher trifft. Angehakt
      beginnt es dort, wo ein Ordner es meist will — links am Hochformat, oben
      am Querformat.
    -->
    {@render check(t('ui.punch'), mp.settings.punch !== null, (next) => mp?.set('punch', next ? (mp.settings.orientation === 'landscape' ? 'top' : 'left') : null))}
    {#if mp.settings.punch}<div class="ding__dep">
      <div class="ding__row"><span class="segmented">{#each ['left', 'top'] as const as edge (edge)}<button type="button" aria-pressed={mp.settings.punch === edge} onclick={() => mp?.set('punch', edge)}>{t(edge === 'left' ? 'ui.punch_left' : 'ui.punch_top')}</button>{/each}</span></div>
      {@render check(t('ui.punch_marks'), mp.settings.punchMarks, (next) => mp?.set('punchMarks', next))}
    </div>{/if}
    <!-- Anybook (2026-10-26, ihr Wunsch): auf jeder Karte mit Symbol, am Titel und mit dem Aktivierungscode in der Ecke der Seite — darum im Seite-Menü (2026-10-27), vor der Fußzeile. -->
    {@render check(t('ui.anybook_circle'), mp.settings.anybookCircle, (next) => mp?.set('anybookCircle', next), !!offer.anybookOff)}
    {#if offer.anybookOff}<p class="ding-check__why small faint">{t(offer.anybookOff)}</p>{/if}
    {#if mp.settings.anybookCircle && (offer.anybookPlaces ?? ANYBOOK_PLACES).length > 1}<div class="ding__dep"><div class="ding__row"><span class="segmented">{#each offer.anybookPlaces ?? ANYBOOK_PLACES as place (place)}<button type="button" aria-pressed={mp.settings.anybookPlace === place} onclick={() => mp?.set('anybookPlace', place)}>{t(`ui.anybook_${place}`)}</button>{/each}</span></div></div>{/if}
    <!-- Der Aktivierungscode oben rechts in der Ecke der ersten Seite (2026-10-27): eine Wahl des Materials, darum hier bei den Codes. -->
    {#if mp.settings.anybookCircle}<div class="ding__dep">{@render check(t('ui.anybook_activation'), mp.settings.anybookActivation !== false, (next) => mp?.set('anybookActivation', next ? undefined : false))}{#if mp.settings.anybookOff?.length}<!-- Wo Codes weggenommen sind, sagt es auch das Menü (ihr Wunsch): in Bearbeiten ist ihr Ring rot durchgestrichen. --><p class="ding-check__why small faint">{t(mp.settings.anybookOff.length === 1 ? 'ui.anybook_off_one' : 'ui.anybook_off_n', { n: mp.settings.anybookOff.length })}</p>{/if}</div>{/if}
    {#if offer.pageNumbers}{@render check(t('ui.page_numbers'), mp.settings.showPageNumbers, (next) => mp?.set('showPageNumbers', next))}{/if}
    {#if metacom}{@render check(t('ui.print_copyright'), mp.settings.showCopyright, (next) => mp?.set('showCopyright', next))}{/if}
  </div>{/if}</span>
  {#if symbolish}<span class="ding"><button class="ding__chip" type="button" aria-label={t('ui.ding_symbol')} aria-expanded={open === 'symbol'} onclick={() => show('symbol')}>{t('ui.ding_symbol')}{@render dd()}</button>{#if open === 'symbol'}<div class="ding__pop" role="group" aria-label={t('ui.ding_symbol')}>
    {#if measures}<!--
      Die Messzeile (2026-10-27, ihr Mock): in jeder Vorlage hier zuoberst und
      gleich — wie groß Symbol, Karte und Wort aus dem Drucker kommen,
      gemessen am Blatt nebenan, gleich wer die Größe bestimmt.
    --><p class="ding__mess{measures.tooBig ? ' ding__mess--warn' : ''}" aria-live="polite">{#if measures.tooBig}{t('ui.card_too_big')}{:else}{#if measures.symbolMm !== null}<span>{t('ui.measure_symbol', { mm: mm(measures.symbolMm) })}</span>{/if}{#if measures.card}<span>{t('ui.measure_card', { w: mm(measures.card.w), h: mm(measures.card.h) })}</span>{/if}{#if measures.labelPt !== null}<span>{t('ui.measure_label', { pt: pt(measures.labelPt) })}</span>{/if}{/if}</p>{/if}
    {#if offer.background || kind() === 'einkaufsliste'}<PaletteRow label={t('ui.cards_fill')} value={mp.settings.cardBackground} strength="fill" none ownStart="#fff1b3" onPick={(next) => mp?.set('cardBackground', next)} />{/if}
    {#if offer.size?.kind === 'cards'}
      <div class="ding__row"><span class="segmented">
        <button type="button" aria-pressed={!gridded && !exact} onclick={() => mp?.set('sheetFit', 'size')}>{t('ui.fit_symbol')}</button>
        <button type="button" aria-pressed={exact} onclick={() => mp?.set('sheetFit', 'card')}>{t('ui.fit_card')}</button>
        <button type="button" aria-pressed={gridded} onclick={() => mp?.set('sheetFit', 'grid')}>{t('ui.grid')}</button>
      </span></div>
      {#if exact}<div class="ding__row">{@render num(t('ui.card_width'), mp.settings.cardWidthMm, 15, 300, 1, 60, 'mm', (next) => mp?.set('cardWidthMm', next))}<label class="ding-num">{t('ui.card_height')} <input class="field" type="number" min="15" max="300" step="1" value={mp.settings.cardHeightMm ?? ''} placeholder={String(mp.settings.cardWidthMm)} aria-label={t('ui.card_height')} oninput={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= 15 && n <= 300) mp?.set('cardHeightMm', n); }} onchange={(event) => { if (event.currentTarget.value.trim() === '') { mp?.set('cardHeightMm', null); return; } const n = clamp(event.currentTarget.valueAsNumber, 15, 300, 15); event.currentTarget.value = String(n); mp?.set('cardHeightMm', n); }} /><span class="ding-num__unit">mm</span></label></div>
      {:else if gridded}<div class="ding__row">{@render num(t('ui.columns'), mp.settings.gridCols, 1, 12, 1, 4, '', (next) => mp?.set('gridCols', Math.round(next)))}{@render num(t('ui.rows'), mp.settings.gridRows, 1, 12, 1, 3, '', (next) => mp?.set('gridRows', Math.round(next)))}</div>
      {:else}{@render num(t('ui.symbol_size'), mp.settings.symbolSizeMm, 10, 120, 1, 40, 'mm', (next) => mp?.set('symbolSizeMm', next))}{/if}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next))}
    {:else if offer.size?.kind === 'symbol'}
      {@render num(t('ui.symbol_size'), mp.settings.symbolSizeMm, 10, offer.size.max, 1, offer.size.fallback, 'mm', (next) => mp?.set('symbolSizeMm', next))}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next))}
    {:else if offer.size?.kind === 'board'}
      {@render num(t('ui.margin'), mp.settings.cutMarginMm, 0, 20, 0.5, 3, 'mm', (next) => mp?.set('cutMarginMm', next))}
    {/if}
    {#if offer.label}{@render check(t('ui.print_label'), mp.settings.showLabel, (next) => mp?.set('showLabel', next))}{#if mp.settings.showLabel}<div class="ding__sub"><span class="segmented">{#each POSITIONS as where (where)}<button type="button" aria-pressed={mp.settings.labelPosition === where} onclick={() => mp?.set('labelPosition', where)}>{where === 'above' ? t('ui.label_above') : t('ui.label_below')}</button>{/each}</span>{@render num(t('ui.font_size'), mp.settings.labelSizePt, 5, 40, 0.5, 11, 'pt', (next) => mp?.set('labelSizePt', next), t('ui.label_size'))}</div>{/if}
    {/if}
    {#if offer.frames || kind() === 'einkaufsliste'}{@render check(t('ui.frame_each'), mp.settings.cardBorderMm > 0, (next) => mp?.set('cardBorderMm', next ? 0.5 : 0))}{/if}
    {#if mp.settings.cardBorderMm > 0}<div class="ding__dep">
      <div class="ding__row">{@render num(t('ui.thickness'), mp.settings.cardBorderMm > 0 ? mp.settings.cardBorderMm : 0.5, 0.1, 5, 0.1, 0.5, 'mm', (next) => mp?.set('cardBorderMm', next))}{@render num(t('ui.corners'), mp.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', (next) => mp?.set('cardRadiusMm', next))}</div>
      <PaletteRow label={t('ui.colour')} value={mp.settings.cardBorderColor} strength="frame" ownStart="#333333" onPick={(next) => mp?.set('cardBorderColor', next ?? '#333333')} />
    </div>{/if}
    {#if offer.cutLines || kind() === 'einkaufsliste'}{@render check(t('ui.cut_lines'), mp.settings.showCutLines, (next) => mp?.set('showCutLines', next))}{/if}
  </div>{/if}</span>{/if}
  {#if ownish && ownName}<span class="ding"><button class="ding__chip" type="button" aria-label={ownName} aria-expanded={open === 'own'} onclick={() => show('own')}>{ownName}{#if offer.talk}{#if mp.settings.gameGroundColour}<span class="ding__dot" style:--c={mp.settings.gameGroundColour}></span>{/if}<span class="ding__dot" style:--c={mp.settings.accentColour}></span>{/if}{@render dd()}</button>{#if open === 'own'}<div class="ding__pop" role="group" aria-label={ownName}>
    {#if offer.sentence}{@render check(t('ui.print_sentence'), mp.settings.showSentenceText, (next) => mp?.set('showSentenceText', next))}{#if mp.settings.showSentenceText}<div class="ding__dep"><div class="ding__row"><span class="segmented">{#each POSITIONS as where (where)}<button type="button" aria-pressed={mp.settings.sentencePosition === where} onclick={() => mp?.set('sentencePosition', where)}>{where === 'above' ? t('ui.label_above') : t('ui.label_below')}</button>{/each}</span>{@render num(t('ui.font_size'), mp.settings.sentenceSizePt, 5, 40, 0.5, 10, 'pt', (next) => mp?.set('sentenceSizePt', next), t('ui.sentence_size'))}</div></div>{/if}{/if}
    {#if offer.stripFrame}{@render check(t('ui.frame_strip'), mp.settings.stripFrame, (next) => mp?.set('stripFrame', next))}{#if mp.settings.stripFrame}<div class="ding__dep"><div class="ding__row">{@render num(t('ui.thickness'), mp.settings.cardBorderMm > 0 ? mp.settings.cardBorderMm : 0.5, 0.1, 5, 0.1, 0.5, 'mm', (next) => mp?.set('cardBorderMm', next))}{@render num(t('ui.corners'), mp.settings.cardRadiusMm, 0, 15, 0.5, 2, 'mm', (next) => mp?.set('cardRadiusMm', next))}</div><PaletteRow label={t('ui.colour')} value={mp.settings.cardBorderColor} strength="frame" ownStart="#333333" onPick={(next) => mp?.set('cardBorderColor', next ?? '#333333')} /></div>{/if}{/if}
    {#if offer.songChecks}{@render check(t('ui.song_headings'), mp.settings.songHeadings, (next) => mp?.set('songHeadings', next))}
    {@render check(t('ui.song_repeats'), mp.settings.songRepeats, (next) => mp?.set('songRepeats', next))}
    {@render check(t('ui.song_refrain_once'), mp.settings.songRefrainOnce, (next) => mp?.set('songRefrainOnce', next))}{/if}
    {#if offer.freeFields}{@render check(t('ui.free_fields_dashed'), mp.settings.markFreeFields, (next) => mp?.set('markFreeFields', next))}{/if}
    {#if offer.game}<!--
      Die zwei Farben des Spiels: der Grund hinter jeder Zeile (Aus druckt sie
      nackt) und der Akzent, der die gedruckten Karten rahmt und die
      gestrichelten Felder zeichnet.
    --><PaletteRow label={t('ui.game_ground')} value={mp.settings.gameGroundColour} strength="fill" none ownStart="#fdeef3" onPick={(next) => mp?.set('gameGroundColour', next)} />
    <PaletteRow label={t('ui.game_accent')} value={mp.settings.accentColour} strength="frame" ownStart="#e0558c" onPick={(next) => mp?.set('accentColour', next ?? '#e0558c')} />{/if}
    {#if offer.talk}<!--
      Die zwei Farben des Plauderbuchs, gespeichert wie die des Spiels: das
      Band der Frage (blasser die Felder; Aus druckt es nackt, die Felder grau)
      und die Linie um das freie Feld.
    --><PaletteRow label={t('ui.talk_band')} value={mp.settings.gameGroundColour} strength="fill" none ownStart="#d8e9fc" onPick={(next) => mp?.set('gameGroundColour', next)} />
    <PaletteRow label={t('ui.talk_line')} value={mp.settings.accentColour} strength="frame" ownStart="#3f88e0" onPick={(next) => mp?.set('accentColour', next ?? '#3f88e0')} />{/if}
  </div>{/if}</span>{/if}
</div>{/if}
