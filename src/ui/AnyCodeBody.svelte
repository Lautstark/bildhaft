<script lang="ts">
  import type { CodeSheet } from './anyCodeSheet.svelte.ts';
  import AnyStift from './AnyStift.svelte';

  let { s }: { s: CodeSheet } = $props();
</script>

<AnyStift code={s.code} />
