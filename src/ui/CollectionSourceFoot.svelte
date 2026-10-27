<script lang="ts">
  import { t } from '../i18n/index.ts';

  /* Any sheet whose presses are written through: the source's, the Ordner's. */
  let { s }: { s: { close(): void } } = $props();
</script>

<div class="spacer"></div><!--
  One way out, and it says what it does. There is nothing to cancel: every press
  has already been written.
--><button class="btn" type="button" onclick={() => s.close()}>{t('ui.done')}</button>
