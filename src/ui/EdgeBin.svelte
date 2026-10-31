<script lang="ts">
  /**
   * Der Mülleimer am Rand: one place for every bin that takes out a whole
   * thing — a row, a Strophe, a page, a Schritt, a Streifen. It stands
   * right of its thing, outside it, level with its first line, never on a
   * card (her pick „A, Mülleimer rechts", 2026-10-31). It shows while the
   * pointer is in the thing, and pointed at, the thing is outlined whole:
   * what goes is seen before the click. The thing it belongs to carries
   * `edge-host`; the bin is its direct child, so a Strophe's bin outlines the
   * Strophe and a line's bin inside it only the line.
   */
  import Icon from '../pieces/Icon.svelte';

  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<span class="edge-bin"><button class="btn destructive icon" type="button" title={label} aria-label={label} {onclick}><Icon name="trash" /></button></span>
