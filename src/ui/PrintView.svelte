<script lang="ts">
  /**
   * The sheet beside the material: every page below the one before, scrolled
   * like a stack of paper — nothing to page through, nothing to open. The
   * quiet row above it carries the facts (how many pages, what the card
   * comes to) and the still tools: PDF, Drucken, einklappen.
   *
   * Folded, the same preview lives on at thumbnail size — the parent only
   * narrows the column, and the width-fit scale follows.
   *
   * The preview is the engine the old column used (`attachPrinting`): built
   * again only for another Sammlung, template or source, and given new
   * content in place otherwise. Settings written outside — the Zeile, the
   * paper pill — are adopted while it is up.
   */
  import { untrack } from 'svelte';
  import type { SavedPdf } from '../core/types.ts';
  import PrintSheet from './PrintSheet.svelte';
  import PrintOptions from './PrintOptions.svelte';
  import { attachPrinting, Printing } from './printDialog.svelte.ts';
  import { openSavedPdf, printOptions } from '../app/print.ts';
  import { activeCollection, kind, providerId, s } from '../app/state.svelte.ts';
  import { TEMPLATES } from '../app/templates.ts';
  import { LOCALE, t } from '../i18n/index.ts';

  let { mini = false, big = false, onFold, onZoom, onClose }: {
    mini?: boolean; big?: boolean; onFold?: () => void; onZoom?: () => void; onClose?: () => void;
  } = $props();

  let song = $derived(activeCollection()?.song);
  let talk = $derived(activeCollection()?.talk);
  let board = $derived(activeCollection()?.board);
  let name = $derived(activeCollection()?.name);
  let title = $derived(activeCollection()?.title);
  let pdfs = $derived(activeCollection()?.pdfs ?? []);
  let settled = $derived(s.settings !== null);
  let template = $derived(kind());
  let source = $derived(providerId());
  /* A template whose look is set in the Zeile over its material brings no
     settings column here: the sheet is only looked at and printed. */
  let zeileInEdit = $derived(Boolean(TEMPLATES[template].zeileInEdit));
  let allPdfs = $state(false);
  let preview = $state.raw<Printing | null>(null);
  function made(options: NonNullable<ReturnType<typeof printOptions>>): Printing {
    const one = new Printing(options);
    /* All pages below one another at the column's width; the column scrolls. */
    one.fit = { kind: 'flow' };
    return one;
  }
  $effect(() => {
    void [s.activeId, template, source, settled];
    const options = untrack(() => printOptions());
    preview = options ? untrack(() => made(options)) : null;
    untrack(() => { allPdfs = false; });
  });
  $effect(() => {
    void [s.sentences, song, talk, board, name, title];
    untrack(() => {
      const options = printOptions();
      if (!preview) { if (options) preview = made(options); return; }
      if (!options) { preview = null; return; }
      preview.update(options);
    });
  });
  /* What the open material keeps for its print, followed while the preview
     is up: the Zeile and the paper pill write there, and the sheet has to
     show it. Edits made in the options column come back identical. The
     copyright line is the household's, not the material's, so its toggle
     moves `s.settings` instead — watched too, for the same reason. */
  let ownPrint = $derived(activeCollection()?.print);
  let housePrint = $derived(s.settings?.print);
  $effect(() => {
    void [ownPrint, housePrint];
    untrack(() => {
      if (!preview) return;
      const options = printOptions();
      if (!options) return;
      if (JSON.stringify(options.settings) === JSON.stringify(preview.settings)) return;
      preview.adopt(options.settings);
    });
  });
  $effect(() => {
    if (!preview) return;
    const current = preview;
    let detach: () => void = () => undefined;
    const later = window.setTimeout(() => { detach = attachPrinting(current); });
    return () => { window.clearTimeout(later); detach(); };
  });

  /* Folded or laid out big, the column is another width at once — and the
     frame's ResizeObserver misses a resize that comes with a reparented
     layout, so the toggle asks for the new scale itself. */
  $effect(() => {
    void [mini, big];
    untrack(() => { preview?.rescale(); requestAnimationFrame(() => preview?.rescale()); });
  });

  /* What the head says beside the paper pill, kept across sessions. */
  $effect(() => {
    const id = s.activeId;
    const count = preview?.pageCount;
    if (id && count) untrack(() => { s.pagesSeen = { ...s.pagesSeen, [id]: count }; });
  });

  const pdfLabel = (saved: SavedPdf): string =>
    `${new Date(saved.at).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${
      saved.paper.toUpperCase()} ${saved.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')}`;
</script>

{#if preview}<div class="print-view">{#if !mini}<span class="print-view__cap">{t('ui.preview_cap')}</span><div class="print-view__quiet"><span class="print-view__meta"><span>{preview.pageCount === 1 ? t('ui.n_page', { n: 1 }) : t('ui.n_pages', { n: preview.pageCount })}</span>{#if preview.cardSize}<span class="small {preview.cardWarn ? 'opt__warn' : 'print-view__meta-sub'}">{preview.cardSize}</span>{/if}</span><span class="print-view__sp"></span><span class="print-view__tools">{#if preview.options.onPdf}<button class="print-view__tool" type="button" aria-label={t('ui.pdf_save')} title={t('ui.pdf_save')} disabled={preview.saving || preview.preparing} onclick={() => preview?.savePdf()}>{#if preview.saving}<span class="spinner"></span>{:else}⤓{/if} PDF</button>{/if}<button class="print-view__tool" type="button" disabled={preview.preparing} onclick={() => preview?.print()}>{#if preview.preparing}<span class="spinner"></span>{/if} {t('ui.print')}</button>{#if big}<button class="print-view__tool" type="button" aria-label={t('ui.preview_close')} title={t('ui.preview_close')} onclick={onClose}>✕</button>{:else if onFold}<button class="print-view__tool" type="button" aria-label={t('ui.preview_fold')} title={t('ui.preview_fold')} onclick={onFold}>»</button>{/if}</span></div>{:else}<div class="print-view__quiet print-view__quiet--mini"><span class="print-view__meta-sub">{t('ui.n_pages_short', { n: preview.pageCount })}</span></div>{/if}<div class="print-view__stage">{#if !mini && !big && onZoom}<button class="print-view__zoom" type="button" aria-label={t('ui.preview_zoom')} title={t('ui.preview_zoom')} onclick={onZoom}></button>{/if}{#key preview}<!--
  Keyed by the preview, so a preview built again gets boxes of its own.
--><div class="preview-frame print-view__frame" role="region" aria-label={t('ui.sheet_preview')} bind:this={preview.frame}><div bind:this={preview.sizer}><div class="preview-scaler" bind:this={preview.scaler}><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider={preview.options.provider} /></div></div></div></div>{/key}</div>{#if !mini && (pdfs.length > 0 || !zeileInEdit)}<aside class="print-view__panel{zeileInEdit ? ' print-view__panel--bare' : ''}" aria-label={t('ui.sheet_column')}>{#if pdfs.length > 0}<div class="print-view__acts"><!--
  The latest PDF kept of this Sammlung, and the others folded under it.
--><p class="small print-view__last"><span class="faint">{t('ui.pdf_last')}</span> {pdfLabel(pdfs[0]!)} · <button class="linklike" type="button" onclick={() => void openSavedPdf(pdfs[0]!)}>{t('ui.pdf_open')}</button>{#if pdfs.length > 1} · <button class="linklike" type="button" aria-expanded={allPdfs} onclick={() => { allPdfs = !allPdfs; }}>{t('ui.pdf_all', { n: pdfs.length })}</button>{/if}</p>{#if allPdfs}<ul class="pdf-list" aria-label={t('ui.pdf_list_title')}>{#each pdfs as saved (saved.path)}<li><span class="small">{pdfLabel(saved)}</span><button class="btn quiet sm" type="button" onclick={() => void openSavedPdf(saved)}>{t('ui.pdf_open')}</button></li>{/each}</ul>{/if}</div>{/if}{#if !zeileInEdit}<PrintOptions s={preview} />{/if}</aside>{/if}</div>{:else}<p class="small faint">{t('ui.nothing_to_print')}</p>{/if}
