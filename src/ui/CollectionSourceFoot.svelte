<script lang="ts">
  import type { Choosing } from './collectionSource.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Choosing } = $props();
</script>

<div class="spacer"></div><!--
  One way out, and it says what it does. There is nothing to cancel: every press
  has already been written.
--><button class="btn" type="button" onclick={() => s.close()}>{t('ui.done')}</button>
