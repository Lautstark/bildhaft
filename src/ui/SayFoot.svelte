<script lang="ts">
  import type { Saying } from './saying.ts';
  let { s }: { s: Saying } = $props();
</script>

<button class="btn primary" type="button" onclick={s.press}>{s.label}</button>
