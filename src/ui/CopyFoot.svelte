<script lang="ts">
  import type { Copying } from './copySheet.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Copying } = $props();
</script>

<div class="spacer"></div><button class="btn quiet" type="button" onclick={() => s.close()}>{t('ui.cancel')}</button><button class="btn primary" type="button" disabled={s.busy} onclick={() => void s.copy()}>{t('ui.copy_do')}</button>
