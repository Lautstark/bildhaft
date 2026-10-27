<script lang="ts">
  import type { CodeSheet } from './anyCodeSheet.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: CodeSheet } = $props();
</script>

<div class="spacer"></div><button class="btn" type="button" onclick={() => s.close()}>{t('ui.done')}</button>
