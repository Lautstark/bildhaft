<script lang="ts">
  /**
   * One row of the palette, inline where it stands: „keine" first where none
   * is allowed, the eight hues, a colour of one's own last. Picking a colour
   * is what switches the thing on; there is no tick beside it to forget, and
   * nothing is switched on that cannot be seen.
   *
   * The swatches are the Tafel's group panel's, class for class, so every
   * place a colour is picked looks and answers alike.
   */
  import { ZONE_COLOURS } from './palette.ts';
  import { t } from '../i18n/index.ts';

  let { label, value, strength, none = false, ownStart = '#2c66c8', onPick }: {
    label: string;
    value: string | null;
    /** `frame` for lines and text, `fill` for grounds — the same eight hues. */
    strength: 'frame' | 'fill';
    /** Whether „keine" is a choice: a ground may be bare, a line's colour may not. */
    none?: boolean;
    ownStart?: string;
    onPick: (next: string | null) => void;
  } = $props();

  /* Five of the Tafel's eight (2026-10-23): a row of a menu, not a zone box —
     eight plus „keine" plus the wheel broke the line. A hue from the other
     three, set elsewhere, shows on the wheel as one's own. */
  let colours = $derived(ZONE_COLOURS.slice(0, 5).map((hue) => ({ value: hue[strength], name: hue.name })));
  let own = $derived(value !== null && !colours.some((c) => c.value === value));
</script>

<div class="palette-row" role="group" aria-label={label}><span class="palette-row__name small faint">{label}</span>{#if none}<button class="group-panel__swatch group-panel__swatch--none{value ? '' : ' group-panel__swatch--on'}" type="button" aria-label="{label}: {t('ui.none')}" aria-pressed={!value} onclick={() => onPick(null)}></button>{/if}{#each colours as colour (colour.value)}<button class="group-panel__swatch{value === colour.value ? ' group-panel__swatch--on' : ''}" type="button" style:--c={colour.value} aria-label={t('ui.colour_for', { what: label, colour: t(colour.name) })} aria-pressed={value === colour.value} onclick={() => onPick(colour.value)}></button>{/each}<label class="group-panel__wheel{own ? ' group-panel__swatch--on' : ''}" title={t('ui.own_colour_for', { what: label })}><input class="group-panel__own" type="color" value={value ?? ownStart} aria-label={t('ui.own_colour_for', { what: label })} onchange={(event) => onPick(event.currentTarget.value)} /></label></div>
