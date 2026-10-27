<script lang="ts">
  import type { StudioExport } from './anyStudio.svelte.ts';
  import VoiceChoice from './VoiceChoice.svelte';
  import { t } from '../i18n/index.ts';

  let { s }: { s: StudioExport } = $props();
</script>

<p class="small">{t('ui.anybook_studio_intro')}</p>
<div class="any-voice">{#if !s.busy}<VoiceChoice id="any-voice" />{/if}</div>
<p class="small">{t('ui.anybook_codes_n', { n: s.live })}</p>
<p class="small faint">{t('ui.anybook_after')}</p>
{#if s.busy && s.total > 0}<p class="small">{t('ui.anybook_recording', { n: Math.min(s.done + 1, s.total), total: s.total })}</p>{/if}
{#if s.error}<p class="small any-error" role="alert">{s.error}</p>{/if}
