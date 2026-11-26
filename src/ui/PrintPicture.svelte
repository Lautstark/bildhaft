<script lang="ts">
  /**
   * One field's picture on paper, without the card round it: a Rezept's title
   * picture, beside its name. Resolved as a card resolves its picture, from the
   * one cache the preview and the printable copy share.
   */
  import type { ProviderId, Slot } from '../core/types.ts';
  import { symbolIdFor } from '../core/types.ts';
  import { followSymbolUrl, type FollowedSymbol } from './symbols.ts';

  let { slot, provider }: { slot: Slot; provider: ProviderId } = $props();

  let id = $derived(symbolIdFor(slot, provider));
  let url = $state<string | null>(null);
  let followed: FollowedSymbol | null = null;
  $effect(() => {
    const wanted = id;
    if (!wanted) { url = null; return; }
    // `whole`: paper, as in PrintCard — the original rather than the screen's copy.
    const following = followSymbolUrl(provider, wanted, (found) => { url = found; }, true);
    followed = following;
    return following.stop;
  });
  const broke = () => { if (url) followed?.broke(url); };
</script>

<span class="ps-title__pic">{#if url}<img src={url} alt="" onerror={broke} style:transform={slot.mirrored ? 'scaleX(-1)' : null} />{/if}</span>
