<script lang="ts">
  /**
   * The copy the printer gets, mounted into #print-root.
   *
   * It draws the same blocks from the same plan as the preview and measures
   * nothing: it is `display: none` on screen and has no heights at all, which
   * is why the plan is worked out on the preview and handed to both.
   */
  import PrintSheet from './PrintSheet.svelte';
  import type { Printing } from './printDialog.svelte.ts';

  let { s }: { s: Printing } = $props();
</script>

<PrintSheet blocks={s.blocks} plan={s.plan} settings={s.settings} provider={s.options.provider} />
