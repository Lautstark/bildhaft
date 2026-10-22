<script lang="ts">
  /**
   * One field's picture on paper, without the card round it: a Rezept's title
   * picture, beside its name. Resolved as a card resolves its picture, from the
   * one cache the preview and the printable copy share.
   */
  import type { ProviderId, Slot } from '../core/types.ts';
  import { symbolIdFor } from '../core/types.ts';
  import { followSymbolUrl } from './symbols.ts';

  let { slot, provider }: { slot: Slot; provider: ProviderId } = $props();

  let id = $derived(symbolIdFor(slot, provider));
  let url = $state<string | null>(null);
  $effect(() => {
    const wanted = id;
    if (!wanted) { url = null; return; }
    return followSymbolUrl(provider, wanted, (found) => { url = found; });
  });
</script>

<span class="ps-title__pic">{#if url}<img src={url} alt="" style:transform={slot.mirrored ? 'scaleX(-1)' : null} />{/if}</span>
