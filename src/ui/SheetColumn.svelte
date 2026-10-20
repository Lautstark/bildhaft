<script lang="ts">
  /**
   * „Blatt": everything about the paper, beside the Sammlung and always there.
   *
   * There is no print menu any more. The sheet is previewed here, small, and
   * set here — paper, size, how it looks — in one order for every template;
   * a press on the preview shows it large. The buttons at the foot print it
   * through the browser or keep it as a PDF beside the Sammlung, and the PDFs
   * kept are listed under them.
   *
   * The preview is the same engine the large one is (`attachPrinting`), so
   * the two cannot disagree, and while nothing else is open this one holds the
   * printable copy — Ctrl+P prints what is shown here.
   *
   * Folded to a strip on request, remembered per device: a small laptop wants
   * the width for the rows. Folded, nothing is laid out.
   */
  import { untrack } from 'svelte';
  import type { SavedPdf } from '../core/types.ts';
  import PrintSheet from './PrintSheet.svelte';
  import Icon from '../pieces/Icon.svelte';
  import PrintOptions from './PrintOptions.svelte';
  import Pager from './Pager.svelte';
  import { attachPrinting, Printing } from './printDialog.svelte.ts';
  import { deleteSavedPdf, openPrint, openSavedPdf, printOptions } from '../app/print.ts';
  import { activeCollection, kind, providerId, s } from '../app/state.svelte.ts';
  import { LOCALE, t } from '../i18n/index.ts';

  const FOLDED = 'bildhaft.sheetFolded';
  const readFolded = (): boolean => {
    try { return localStorage.getItem(FOLDED) === '1'; } catch { return false; }
  };
  let folded = $state(readFolded());
  function toggle(): void {
    folded = !folded;
    try { localStorage.setItem(FOLDED, folded ? '1' : '0'); } catch { /* a private window keeps nothing */ }
  }

  /* What the sheet is made of. Deriveds, so that a write to the Sammlung that
     leaves these alone — its print settings, every time a control moves — does
     not build the preview again under the control being moved. */
  let song = $derived(activeCollection()?.song);
  let board = $derived(activeCollection()?.board);
  let name = $derived(activeCollection()?.name);
  let pdfs = $derived(activeCollection()?.pdfs ?? []);
  /* Whether the household's settings are in yet — and only that: they change
     with every control moved in a Satzstreifen, and a preview built again
     under the control being moved loses its place and its focus. */
  let settled = $derived(s.settings !== null);
  let allPdfs = $state(false);

  let preview = $state.raw<Printing | null>(null);
  /* A preview for the column: its whole width, and only as high as the page
     lying in it. Made whole before it is handed over — set on the preview
     afterwards, inside the effect that assigned it, the effect read what it
     had just written and ran again without end. */
  function columnPreview(options: NonNullable<ReturnType<typeof printOptions>>): Printing {
    const made = new Printing(options);
    made.fit = { kind: 'width', maxHeight: 380 };
    return made;
  }
  /* A preview of its own for each Sammlung, template and source. */
  $effect(() => {
    void [s.activeId, kind(), providerId(), settled];
    const options = untrack(() => printOptions());
    preview = options ? columnPreview(options) : null;
    untrack(() => { allPdfs = false; });
  });
  /* Within one, the content changes under the same preview: rows typed or
     corrected, their symbols looked up, a grid resized, a song rewritten. */
  $effect(() => {
    void [s.sentences, song, board, name];
    untrack(() => {
      const options = printOptions();
      if (!preview) { if (options) preview = columnPreview(options); return; }
      if (!options) { preview = null; return; }
      preview.update(options);
    });
  });

  /* Made live once its boxes are on the page — a task later, because laying
     the pages out flushes, and a flush inside an effect is refused. A task and
     not an animation frame: a tab in the background draws no frames, and a
     preview waiting for one stood unplanned until it was looked at. */
  $effect(() => {
    if (!preview || folded) return;
    const current = preview;
    let detach: () => void = () => undefined;
    const later = window.setTimeout(() => { detach = attachPrinting(current); });
    return () => { window.clearTimeout(later); detach(); };
  });

  const pdfLabel = (saved: SavedPdf): string =>
    `${new Date(saved.at).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${
      saved.paper.toUpperCase()} ${saved.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')}`;

  /* The preview is the button that shows it large, and the arrow keys turn
     its pages as the arrows under it do. */
  function large(event: KeyboardEvent | MouseEvent): void {
    if (event instanceof KeyboardEvent) {
      if (preview && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        preview.showPage(preview.pageAt + (event.key === 'ArrowLeft' ? -1 : 1));
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
    }
    event.preventDefault();
    openPrint();
  }
</script>

{#if preview}<aside class="sheet-col{folded ? ' sheet-col--folded' : ''}" aria-label={t('ui.sheet_column')}><div class="sheet-col__head">{#if !folded}<b>{t('ui.sheet_column')}</b>{/if}<button class="btn quiet icon sheet-col__fold" type="button" aria-expanded={!folded} title={folded ? t('ui.sheet_unfold') : t('ui.sheet_fold')} aria-label={folded ? t('ui.sheet_unfold') : t('ui.sheet_fold')} onclick={toggle}><Icon name={folded ? 'chevronLeft' : 'chevronRight'} /></button>{#if folded}<!--
  Folded, the whole strip is the way back — the same narrow strip the
  sidebar leaves when it is put away, named so it is not a mystery.
--><button class="sheet-col__strip" type="button" tabindex="-1" aria-hidden="true" onclick={toggle}>{t('ui.sheet_column')}</button>{/if}</div>{#if !folded}<!--
  Keyed by the preview, so a preview built again — rows added, another
  Sammlung — gets boxes of its own: bound once, the boxes stayed with the
  first preview and the new one had nothing to measure.
-->{#key preview}<!--
  The preview is the button that shows it large: it is what somebody reaches
  for when the small one is too small.
--><div class="preview-frame sheet-col__preview" role="button" tabindex="0" aria-label={t('ui.sheet_large')} title={t('ui.sheet_large')} onclick={large} onkeydown={large} bind:this={preview.frame}><div bind:this={preview.sizer}><div class="preview-scaler" bind:this={preview.scaler}><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider={preview.options.provider} /></div></div></div></div>{/key}<!--
  Not keyed: the controls stay the same elements when the preview is built
  again under them — a grid resized, a row added — so the one being used keeps
  its focus.
--><Pager s={preview} /><PrintOptions s={preview} /><div class="sheet-col__acts">{#if preview.options.onPdf}<button class="btn primary" type="button" disabled={preview.saving || preview.preparing} onclick={() => preview?.savePdf()}>{#if preview.saving}<span class="spinner"></span> {t('ui.pdf_saving')}{:else}{t('ui.pdf_save')}{/if}</button>{/if}<button class="btn" type="button" disabled={preview.preparing} onclick={() => preview?.print()}>{#if preview.preparing}<span class="spinner"></span> {t('ui.preparing')}{:else}{t('ui.print')}{/if}</button>{#if pdfs.length > 0}<!--
  The latest PDF kept of this Sammlung, and the others folded under it. Opened
  from the folder each time, so one moved or deleted by hand says so rather
  than opening a stale copy.
--><p class="small sheet-col__last"><span class="faint">{t('ui.pdf_last')}</span> {pdfLabel(pdfs[0]!)} · <button class="linklike" type="button" onclick={() => void openSavedPdf(pdfs[0]!)}>{t('ui.pdf_open')}</button>{#if pdfs.length > 1} · <button class="linklike" type="button" aria-expanded={allPdfs} onclick={() => { allPdfs = !allPdfs; }}>{t('ui.pdf_all', { n: pdfs.length })}</button>{/if}</p>{#if allPdfs}<ul class="pdf-list" aria-label={t('ui.pdf_list_title')}>{#each pdfs as saved (saved.path)}<li><span class="small">{pdfLabel(saved)}</span><button class="btn quiet sm" type="button" onclick={() => void openSavedPdf(saved)}>{t('ui.pdf_open')}</button><button class="btn quiet sm destructive" type="button" onclick={() => void deleteSavedPdf(saved)}>{t('ui.pdf_delete')}</button></li>{/each}</ul>{/if}{/if}</div>{/if}</aside>{/if}
