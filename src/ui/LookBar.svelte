<script lang="ts">
  /**
   * How a material looks, set where it is made: one line of buttons over the
   * wall, which is drawn as it prints.
   *
   * What stands here is what would stay the same on any paper — colours, the
   * frame and its pen, whether the word prints and where. What changes when
   * the paper does (sizes, margins, the type's points) is fitted in Drucken.
   * Each button is there only when the template offers it (`offers` in
   * app/templates.ts), so one bar serves every template that sets its look
   * here.
   *
   * Three colours for three things, picked apart: the title's, the text's
   * (every word on the paper but the title), and the frame's, as a dot on its
   * own button. All from one palette, so they go together without trying.
   */
  import type { CollectionKind, PrintSettings } from '../core/types.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import { titleColour } from './printSheet.ts';
  import { ZONE_COLOURS } from './palette.ts';
  import ColourPick from './ColourPick.svelte';
  import { t } from '../i18n/index.ts';

  let { s }: {
    s: {
      settings: PrintSettings;
      set: <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => void;
      patch: (next: Partial<PrintSettings>) => void;
      options: { kind: CollectionKind };
    };
  } = $props();

  /* Black first among the strong ones: a title and a frame start black. */
  const STRONG = [{ value: '#000000', name: 'ui.zone_black' }, ...ZONE_COLOURS.map((c) => ({ value: c.frame, name: c.name }))];
  const PALE = ZONE_COLOURS.map((c) => ({ value: c.fill, name: c.name }));

  let offer = $derived(TEMPLATES[s.options.kind].offers(s.settings));
  let framed = $derived(s.settings.cardBorderMm > 0);
  let frameOpen = $state(false);
  let frameHost: HTMLElement | undefined = $state();

  function clamp(value: number, min: number, max: number, fallback: number): number {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }
  const away = (event: PointerEvent) => {
    if (frameOpen && frameHost && !frameHost.contains(event.target as Node)) frameOpen = false;
  };
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') frameOpen = false; }} />

<div class="look-bar" role="group" aria-label={t('ui.group_look')}>{#if offer.title}<ColourPick label={t('ui.look_title')} value={titleColour(s.settings)} colours={STRONG} ownStart="#3f88e0" onPick={(next) => s.set('titleColour', next)} />{/if}{#if offer.title}<label class="look-chip{s.settings.titleLine ? ' look-chip--on' : ''}"><input type="checkbox" checked={s.settings.titleLine} onchange={(event) => s.set('titleLine', event.currentTarget.checked)} />{t('ui.look_title_line')}</label>{/if}{#if offer.label || offer.sentence}<ColourPick label={t('ui.look_text')} value={s.settings.textColour} colours={STRONG} ownStart="#3f88e0" onPick={(next) => s.set('textColour', next ?? '#000000')} />{/if}{#if offer.label}<span class="look-chip{s.settings.showLabel ? ' look-chip--on' : ''}"><label class="look-chip__check"><input type="checkbox" checked={s.settings.showLabel} onchange={(event) => s.set('showLabel', event.currentTarget.checked)} />{t('ui.look_word')}</label>{#if s.settings.showLabel}<span class="segmented segmented--small">{#each [{ at: 'above' as const, label: t('ui.label_above') }, { at: 'below' as const, label: t('ui.label_below') }] as one (one.at)}<button type="button" aria-pressed={s.settings.labelPosition === one.at} onclick={() => s.set('labelPosition', one.at)}>{one.label}</button>{/each}</span>{/if}</span>{/if}{#if offer.frames}<span class="look-pick" bind:this={frameHost}><span class="look-chip{framed ? ' look-chip--on' : ''}"><label class="look-chip__check"><input type="checkbox" checked={framed} onchange={(event) => s.set('cardBorderMm', event.currentTarget.checked ? 0.5 : 0)} />{t('ui.look_frame')}</label>{#if framed}<ColourPick bare label={t('ui.look_frame_colour')} value={s.settings.cardBorderColor} colours={STRONG} ownStart="#3f88e0" onPick={(next) => s.set('cardBorderColor', next ?? '#000000')} /><button class="look-chip__more" type="button" aria-expanded={frameOpen} aria-label={t('ui.look_frame_more')} onclick={() => { frameOpen = !frameOpen; }}>▾</button>{/if}</span>{#if framed && frameOpen}<span class="look-pop look-pop--form" role="group" aria-label={t('ui.look_frame')}><label>{t('ui.thickness')}<input class="field" type="number" min="0.1" max="5" step="0.1" value={s.settings.cardBorderMm} onchange={(event) => s.set('cardBorderMm', clamp(event.currentTarget.valueAsNumber, 0.1, 5, 0.5))} /> mm</label><label>{t('ui.corners')}<input class="field" type="number" min="0" max="20" step="0.5" value={s.settings.cardRadiusMm} onchange={(event) => s.set('cardRadiusMm', clamp(event.currentTarget.valueAsNumber, 0, 20, 2))} /> mm</label></span>{/if}</span>{/if}{#if offer.background}<ColourPick label={t('ui.look_background')} value={s.settings.cardBackground} colours={PALE} none ownStart="#fff1b3" onPick={(next) => s.set('cardBackground', next)} />{/if}{#if offer.page}<ColourPick label={t('ui.look_page')} value={s.settings.pageColour} colours={PALE} none ownStart="#d8e9fc" onPick={(next) => s.set('pageColour', next)} />{/if}</div>
