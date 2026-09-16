<script lang="ts">
  import type { Rescuing } from './rescue.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Rescuing } = $props();
</script>

<button class="btn primary" type="button" disabled={s.going} onclick={() => void s.save()}>{t('ui.rescue_download')}</button><!--
  Disabled until the file has been taken, and this is the whole enforcement of
  "handed their data before anything is destroyed".

  A second dialog asking "are you sure" was the other way to do it, and it would
  be showModal() on top of showModal(). A button that cannot be pressed until
  the file has been taken says the same thing earlier, and it names the act
  rather than asking about it.
--><button class="btn destructive" type="button" disabled={!s.saved || s.going} onclick={() => void s.discard()}>{t('ui.rescue_discard', { from: s.dump.version })}</button>
