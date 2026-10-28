<script lang="ts">
  import type { StudioExport } from './anyStudio.svelte.ts';
  import VoiceChoice from './VoiceChoice.svelte';
  import { t } from '../i18n/index.ts';

  let { s }: { s: StudioExport } = $props();
  /* „Alle drucken": no picker — each material speaks in its own voice. */
  let speaking = $derived(s.group?.filter((one) => one.anybook).length ?? 0);
  let without = $derived(s.group?.filter((one) => !one.anybook).map((one) => t('ui.anybook_quoted', { name: one.name })) ?? []);
</script>

<p class="small">{t('ui.anybook_studio_intro')}</p>
{#if s.group}
<p class="small">{t(speaking === 1 ? 'ui.anybook_group_one' : 'ui.anybook_group_n', { m: speaking, n: s.live })}</p>
{#if without.length}<p class="small faint">{t(without.length === 1 ? 'ui.anybook_group_without_one' : 'ui.anybook_group_without_n', { names: without.join(', ') })}</p>{/if}
{:else}
<div class="any-voice">{#if !s.busy}<VoiceChoice id="any-voice" />{/if}</div>
<p class="small">{t('ui.anybook_codes_n', { n: s.live })}</p>
{/if}
<p class="small faint">{t('ui.anybook_after')}</p>
{#if s.busy && s.total > 0}<p class="small">{t('ui.anybook_recording', { n: Math.min(s.done + 1, s.total), total: s.total })}</p>{/if}
{#if s.error}<p class="small any-error" role="alert">{s.error}</p>{/if}
