<script lang="ts">
  /**
   * Das eine Gesicht eines Worts, wo immer es steht: sein Symbol auf dem
   * eigenen Weiß — oder die fragende Kachel, solange keins gewählt ist —
   * und das Wort darunter. Die Karte (WordCard.svelte) und das Satzglied
   * (Row.svelte) rendern beide dieses Gesicht; Größe, Klick und Ziehen
   * gehören dem, der es trägt. Eine Quelle, damit die beiden nie wieder
   * auseinanderlaufen.
   */
  import type { ProviderId } from '../core/types.ts';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import NegationCross from '../pieces/NegationCross.svelte';
  import { noteUnreadable } from '../app/editing.ts';

  let { provider, id, caption, mirrored = false, negated = false }: {
    provider: ProviderId; id: string | null; caption: string;
    mirrored?: boolean; negated?: boolean;
  } = $props();
</script>

{#if id}<span class="word__pic"><SymbolPicture {provider} {id} alt={caption} {mirrored} onUnreadable={(bad) => void noteUnreadable(bad)} />{#if negated}<NegationCross />{/if}</span>{:else}<span class="word__pic word__pic--asking">?</span>{/if}<b class="word__name">{caption}</b>
