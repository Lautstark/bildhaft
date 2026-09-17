<script lang="ts">
  /**
   * One card as it goes on paper.
   *
   * The frame is a real element rather than a border on the card, because the
   * card's edge is the cut line: a border there would be cut through. It is
   * also only drawn when something asks for it, which is what keeps an unframed
   * card exactly the size it has always been.
   */
  import type { PrintSettings, ProviderId, Slot } from '../core/types.ts';
  import { slotCaption, symbolIdFor } from '../core/types.ts';
  import NegationCross from '../pieces/NegationCross.svelte';
  import { peekSymbolUrl, resolveSymbolUrl } from './symbols.ts';

  let { slot, settings, provider, fill = false, exact = false, background, block }: {
    slot: Slot;
    settings: PrintSettings;
    provider: ProviderId;
    /** The card takes its box from its grid cell rather than from the symbol. */
    fill?: boolean;
    /**
     * The card takes its box from the millimetres somebody typed — the same
     * card as `fill`, with the size coming from the settings instead of from
     * the cell around it, and the symbol taking what is left inside it.
     */
    exact?: boolean;
    /** What this one card's ground is, where the sheet's own answer is wrong
     *  for it — a card lying on a Tafel's coloured block. */
    background?: string;
    /** The block this card lies in, as a layer under it and a name over it. */
    block?: {
      fill: string; frame: string | null; inset: string; borderRadius: string;
      borderWidth: string; clipPath: string; joints: Record<string, string>[];
      shield: { text: string; colour: string } | null;
    } | null;
  } = $props();

  let id = $derived(symbolIdFor(slot, provider));
  let label = $derived(slotCaption(slot));

  /* Known straight away wherever the page has already drawn this symbol, which
     is the ordinary case: the preview, the rows behind the dialog and the
     printable copy all read one process-wide cache. */
  let url = $state<string | null>(null);
  $effect(() => {
    const wanted = id;
    if (!wanted) { url = null; return; }
    const known = peekSymbolUrl(provider, wanted);
    if (known) { url = known; return; }
    url = null;
    void resolveSymbolUrl(provider, wanted).then((found) => {
      if (found && wanted === id) url = found;
    });
  });

  let framed = $derived(settings.cardBorderMm > 0 || settings.cardBackground !== null);

  /* A record of CSS, written out: the joints' two gradients and their sizes are
     more than the `style:` directive can carry one property at a time. */
  const asStyle = (from: Record<string, string>): string =>
    Object.entries(from).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`).join(';');
</script>

{#snippet contents()}<!--
  The cross is drawn beside whatever is in the box rather than over a picture
  that may not have arrived: a symbol that resolves late replaces what stood in
  for it, and a cross merely appended once would go with it.
--><div class="ps-card__img">{#if url}<!--
  alt is empty on purpose: a broken image would otherwise print its alt text
  inside the card, duplicating the label below it.
--><img src={url} alt="" onerror={() => { url = null; }} />{:else}<div class="ps-card__blank"></div>{/if}{#if slot.negated}<NegationCross />{/if}</div>{#if settings.showLabel}<div class="ps-card__label">{label}</div>{/if}{/snippet}

<div class="ps-card{settings.labelPosition === 'above' ? ' ps-card--label-above' : ''}{fill || exact ? ' ps-card--fill' : ''}{exact ? ' ps-card--exact' : ''}{framed ? ' ps-card--framed' : ''}" style:--card-bg={background}>{#if block}{#each block.joints as joint, at (at)}<div class="ps-joint" style={asStyle(joint)}></div>{/each}<div class="ps-block" style:--zone={block.fill} style:inset={block.inset} style:border-radius={block.borderRadius} style:border-color={block.frame ?? 'transparent'} style:border-width={block.borderWidth} style:clip-path={block.clipPath}></div>{/if}{#if framed}<div class="ps-card__frame">{@render contents()}</div>{:else}{@render contents()}{/if}{#if block?.shield}<!-- The name, as a shield on the block's top left edge, on the group's first field. --><div class="ps-shield" style:--shield={block.shield.colour}>{block.shield.text}</div>{/if}</div>
