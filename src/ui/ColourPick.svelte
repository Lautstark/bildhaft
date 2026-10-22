<script lang="ts">
  /**
   * One colour in the look bar: a button that names it and shows it, and
   * under it the palette — „keine" first where there may be none, then the
   * eight, then a colour of one's own. Picking a colour is what switches it
   * on; there is no tick beside it to forget, and nothing is switched on that
   * cannot be seen.
   *
   * The swatches are the Tafel's group panel's, class for class, so the two
   * places a colour is picked look and answer alike.
   */
  import { t } from '../i18n/index.ts';

  let { label, value, colours, none = false, bare = false, ownStart, onPick }: {
    label: string;
    value: string | null;
    colours: { value: string; name: string }[];
    /** Whether „keine" is a choice: a ground may be bare, a line's colour may not. */
    none?: boolean;
    /** Only the dot, for a colour that belongs to a button already there: the frame's. */
    bare?: boolean;
    ownStart: string;
    onPick: (next: string | null) => void;
  } = $props();

  let open = $state(false);
  let host: HTMLElement | undefined = $state();
  let own = $derived(value !== null && !colours.some((c) => c.value === value));

  const pick = (next: string | null) => { onPick(next); open = false; };
  const away = (event: PointerEvent) => {
    if (open && host && !host.contains(event.target as Node)) open = false;
  };
</script>

<svelte:window onpointerdown={away} onkeydown={(event) => { if (event.key === 'Escape') open = false; }} />

<span class="look-pick" bind:this={host}>{#if bare}<button class="look-dot-btn" type="button" aria-label={label} aria-expanded={open} onclick={() => { open = !open; }}><span class="look-dot" style:--c={value ?? 'transparent'}></span></button>{:else}<button class="look-chip{value ? ' look-chip--on' : ''}" type="button" aria-expanded={open} onclick={() => { open = !open; }}>{label}<span class="look-dot{value ? '' : ' look-dot--none'}" style:--c={value ?? 'transparent'}></span></button>{/if}{#if open}<span class="look-pop group-panel__row" role="group" aria-label={label}>{#if none}<button class="group-panel__swatch group-panel__swatch--none{value ? '' : ' group-panel__swatch--on'}" type="button" aria-label="{label}: {t('ui.none')}" aria-pressed={!value} onclick={() => pick(null)}></button>{/if}{#each colours as colour (colour.value)}<button class="group-panel__swatch{value === colour.value ? ' group-panel__swatch--on' : ''}" type="button" style:--c={colour.value} aria-label={t('ui.colour_for', { what: label, colour: t(colour.name) })} aria-pressed={value === colour.value} onclick={() => pick(colour.value)}></button>{/each}<label class="group-panel__wheel{own ? ' group-panel__swatch--on' : ''}" title={t('ui.own_colour_for', { what: label })}><input class="group-panel__own" type="color" value={value ?? ownStart} aria-label={t('ui.own_colour_for', { what: label })} onchange={(event) => pick(event.currentTarget.value)} /></label></span>{/if}</span>
