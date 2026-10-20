<script lang="ts">
  /**
   * The sheet large, page under page — the preview the column beside a
   * Sammlung shows small, opened to judge where the pages break. Nothing is set
   * here: what the sheet looks like is set in the column.
   */
  import PrintSheet from './PrintSheet.svelte';
  import Pager from './Pager.svelte';
  import type { Printing } from './printDialog.svelte.ts';

  let { s }: { s: Printing } = $props();
</script>

<div class="preview-frame preview-frame--big" bind:this={s.frame}><div bind:this={s.sizer}><div class="preview-scaler" bind:this={s.scaler}><div style="width:fit-content" bind:this={s.holder}><PrintSheet blocks={s.blocks} plan={s.plan} settings={s.settings} provider={s.options.provider} /></div></div></div></div><Pager {s} />
