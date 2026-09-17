<script lang="ts">
  /** A sheet that says one thing and offers one way out. */
  import type { Saying } from './saying.ts';
  let { s }: { s: Saying } = $props();
</script>

{s.line}
