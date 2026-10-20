<script lang="ts">
  /**
   * Which page of the sheet is showing, and the arrows that turn it. The
   * preview shows one page at a time rather than scrolling through them, so
   * a page is always seen whole. One page needs no arrows and says so plainly.
   */
  import type { Printing } from './printDialog.svelte.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Printing } = $props();
</script>

<div class="pager">{#if s.pageCount > 1}<button class="btn quiet icon sm" type="button" aria-label={t('ui.page_prev')} title={t('ui.page_prev')} disabled={s.pageAt === 0} onclick={() => s.showPage(s.pageAt - 1)}>‹</button><span class="small faint pager__at" aria-live="polite">{t('ui.page_n', { n: s.pageAt + 1, total: s.pageCount })}</span><button class="btn quiet icon sm" type="button" aria-label={t('ui.page_next')} title={t('ui.page_next')} disabled={s.pageAt >= s.pageCount - 1} onclick={() => s.showPage(s.pageAt + 1)}>›</button>{:else}<span class="small faint pager__at">{t('ui.n_page', { n: 1 })}</span>{/if}</div>
