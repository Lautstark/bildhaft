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

  let { label, value, mixed = null, strength, none = false, ownStart = '#2c66c8', onPick }: {
    label: string;
    value: string | null;
    /** Who has which colour, where the materials of „Alle drucken" disagree: then none stands picked. */
    mixed?: string | null;
    /** `frame` for lines and text, `fill` for grounds — the same eight hues. */
    strength: 'frame' | 'fill';
    /** Whether „keine" is a choice: a ground may be bare, a line's colour may not. */
    none?: boolean;
    ownStart?: string;
    onPick: (next: string | null) => void;
  } = $props();

  /* Five of the Tafel's eight (2026-10-23): a row of a menu, not a zone box —
     eight plus „keine" plus the wheel broke the line. A hue from the other
     three, set elsewhere, shows on the wheel as one's own. The pale row opens
     with white (2026-10-26, her wish): paper's own ground is a colour too. */
  let colours = $derived([
    ...(strength === 'fill' ? [{ value: '#ffffff', name: 'ui.zone_white' }] : []),
    ...ZONE_COLOURS.slice(0, 5).map((hue) => ({ value: hue[strength], name: hue.name })),
  ]);
  let own = $derived(!mixed && value !== null && !colours.some((c) => c.value === value));
  let on = (colour: string | null): boolean => !mixed && value === colour;
</script>

<div class="palette-row" role="group" aria-label={label}><span class="palette-row__name small faint">{label}</span>{#if none}<button class="group-panel__swatch group-panel__swatch--none{on(null) ? ' group-panel__swatch--on' : ''}" type="button" aria-label="{label}: {t('ui.none')}" aria-pressed={on(null)} onclick={() => onPick(null)}></button>{/if}{#each colours as colour (colour.value)}<button class="group-panel__swatch{on(colour.value) ? ' group-panel__swatch--on' : ''}" type="button" style:--c={colour.value} aria-label={t('ui.colour_for', { what: label, colour: t(colour.name) })} aria-pressed={on(colour.value)} onclick={() => onPick(colour.value)}></button>{/each}<label class="group-panel__wheel{own ? ' group-panel__swatch--on' : ''}" title={t('ui.own_colour_for', { what: label })}><input class="group-panel__own" type="color" value={value ?? ownStart} aria-label={t('ui.own_colour_for', { what: label })} onchange={(event) => onPick(event.currentTarget.value)} /></label></div>{#if mixed}<p class="ding__mixed small faint">{mixed}</p>{/if}
