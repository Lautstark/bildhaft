<script lang="ts">
  import type { StudioExport } from './anyStudio.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: StudioExport } = $props();
</script>

<div class="spacer"></div><button class="btn quiet" type="button" onclick={() => s.close()}>{t('ui.cancel')}</button><button class="btn primary" type="button" disabled={s.busy || !s.voice || !s.live} onclick={() => void s.save()}>{#if s.busy}<span class="spinner"></span>{/if} {t('ui.anybook_save')}</button>
