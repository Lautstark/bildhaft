<script lang="ts">
  import type { Rescuing } from './rescue.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Rescuing } = $props();
</script>

<p>{t('ui.rescue_body', { from: s.dump.version })}</p><p class="hint">{t('ui.rescue_holds', { n: s.held })}</p><!--
  The sheet's own live region. showModal() makes the page behind it inert, so
  the toast is not somewhere anybody can be told anything while this is open —
  conventions.md §3.8, "a modal earns a second region". In the tree from the
  first paint and empty, because a region that arrives carrying its message
  announces nothing.
--><p class="hint" role="status">{s.said}</p>
