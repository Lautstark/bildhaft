<script lang="ts">
  import SourcePicker from './SourcePicker.svelte';
  import type { Choosing } from './collectionSource.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Choosing } = $props();
</script>

<p class="small muted" style="margin:0 0 12px">{t('ui.drawn_with', { name: s.options.collection.name })}</p><SourcePicker current={s.chosen} fallback={s.options.fallback} pick={(choice) => s.pick(choice)} /><p class="small faint" style="margin:14px 0 0">{s.cost}</p>
