<script lang="ts">
  import type { Printing } from './printDialog.svelte.ts';
  import { PAGE_MARGIN_MM, paperLabel } from './printSheet.ts';
  import { t } from '../i18n/index.ts';

  let { s }: { s: Printing } = $props();

  // How much paper this is, said before the paper is used rather than after.
  let meta = $derived.by(() => {
    const paper = `${paperLabel(s.settings.paper)} ${
      s.settings.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')}`;
    const fit = s.settings.layout === 'sheet' ? s.settings.sheetFit : 'size';
    const cards = fit === 'grid'
      ? t('ui.grid_meta', { cols: s.settings.gridCols, rows: s.settings.gridRows })
      : fit === 'card'
        ? t('ui.cards_meta', {
            w: s.settings.cardWidthMm, h: s.settings.cardHeightMm ?? s.settings.cardWidthMm })
        : t('ui.symbol_size_meta', { mm: s.settings.symbolSizeMm });
    const pages = t(s.pageCount === 1 ? 'ui.n_page' : 'ui.n_pages', { n: s.pageCount });
    return `${paper} · ${t('ui.margins_meta', { mm: PAGE_MARGIN_MM })} · ${cards} · ${pages}`;
  });
</script>

<span class="small faint">{meta}</span><div class="spacer"></div>{#if s.options.onPdf}<button class="btn" type="button" disabled={s.saving || s.preparing} onclick={() => s.savePdf()}>{#if s.saving}<span class="spinner"></span> {t('ui.pdf_saving')}{:else}{t('ui.pdf_save')}{/if}</button>{/if}<button class="btn primary" type="button" disabled={s.preparing} onclick={() => s.print()}>{#if s.preparing}<span class="spinner"></span> {t('ui.preparing')}{:else}{t('ui.print')}{/if}</button>
