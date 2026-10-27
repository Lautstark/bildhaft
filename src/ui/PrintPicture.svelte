<script lang="ts">
  /**
   * One field's picture on paper, without the card round it: a Rezept's title
   * picture, beside its name. Resolved as a card resolves its picture, from the
   * one cache the preview and the printable copy share.
   */
  import type { PrintSettings, ProviderId, Slot } from '../core/types.ts';
  import { slotCaption, symbolIdFor } from '../core/types.ts';
  import AnyCode from './AnyCode.svelte';
  import { followSymbolUrl, type FollowedSymbol } from './symbols.ts';

  /* `settings` only where the picture is a card of its own — a Spiel's, a
     Plauderbuch's — and so carries an Anybook code like any card. */
  let { slot, provider, settings }: { slot: Slot; provider: ProviderId; settings?: PrintSettings } = $props();

  let id = $derived(symbolIdFor(slot, provider));
  let url = $state<string | null>(null);
  let followed: FollowedSymbol | null = null;
  $effect(() => {
    const wanted = id;
    if (!wanted) { url = null; return; }
    const following = followSymbolUrl(provider, wanted, (found) => { url = found; });
    followed = following;
    return following.stop;
  });
  const broke = () => { if (url) followed?.broke(url); };
</script>

<span class="ps-title__pic">{#if url}<img src={url} alt="" onerror={broke} style:transform={slot.mirrored ? 'scaleX(-1)' : null} />{/if}{#if settings?.anybookCircle}<AnyCode {settings} key={slot.id} standing={slotCaption(slot)} />{/if}</span>
