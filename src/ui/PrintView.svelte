<script lang="ts">
  /**
   * „Drucken": the open Sammlung's sheet, given the whole page.
   *
   * The other view of a Sammlung — the head switches between its material
   * („Bearbeiten") and this. The sheet stands large in the middle, a page at a
   * time; on the left every page small, to see how many there are and where
   * they break, and to jump; on the right the two buttons the view is for,
   * the PDFs kept, and the settings — Papier, Größe, Gestaltung, the template's own, Fußzeile, in one order
   * for every template.
   *
   * The preview is the engine the old column used (`attachPrinting`): built
   * again only for another Sammlung, template or source, and given new
   * content in place otherwise, so a control being used keeps its focus.
   */
  import { untrack } from 'svelte';
  import type { SavedPdf } from '../core/types.ts';
  import PrintSheet from './PrintSheet.svelte';
  import PrintOptions from './PrintOptions.svelte';
  import Pager from './Pager.svelte';
  import { attachPrinting, Printing } from './printDialog.svelte.ts';
  import { paperSize, PX_PER_MM } from './printSheet.ts';
  import { openSavedPdf, printOptions } from '../app/print.ts';
  import { activeCollection, kind, providerId, s } from '../app/state.svelte.ts';
  import { LOCALE, t } from '../i18n/index.ts';

  let song = $derived(activeCollection()?.song);
  let talk = $derived(activeCollection()?.talk);
  let game = $derived(activeCollection()?.game);
  let board = $derived(activeCollection()?.board);
  let name = $derived(activeCollection()?.name);
  let pdfs = $derived(activeCollection()?.pdfs ?? []);
  let settled = $derived(s.settings !== null);
  let template = $derived(kind());
  let source = $derived(providerId());
  let allPdfs = $state(false);
  let preview = $state.raw<Printing | null>(null);
  function made(options: NonNullable<ReturnType<typeof printOptions>>): Printing {
    const one = new Printing(options);
    return one;
  }
  $effect(() => {
    void [s.activeId, template, source, settled];
    const options = untrack(() => printOptions());
    preview = options ? untrack(() => made(options)) : null;
    untrack(() => { allPdfs = false; });
  });
  $effect(() => {
    void [s.sentences, song, talk, game, board, name];
    untrack(() => {
      const options = printOptions();
      if (!preview) { if (options) preview = made(options); return; }
      if (!options) { preview = null; return; }
      preview.update(options);
    });
  });
  $effect(() => {
    if (!preview) return;
    const current = preview;
    let detach: () => void = () => undefined;
    const later = window.setTimeout(() => { detach = attachPrinting(current); });
    return () => { window.clearTimeout(later); detach(); };
  });

  /* What the head says beside the switch, kept for when this view is left. */
  $effect(() => {
    const id = s.activeId;
    const count = preview?.pageCount;
    if (id && count) untrack(() => { s.pagesSeen = { ...s.pagesSeen, [id]: count }; });
  });

  /* The whole view as high as the window leaves room for under the head —
     and, in the templates that still have it there, the box above it. The middle then
     holds the sheet whole, its frame's own observer scaling the page into
     it, and the two sides scroll on their own. */
  let view: HTMLElement | undefined = $state();
  let viewH = $state<number | null>(null);
  const BOTTOM_GAP = 16;
  function fitHeight(): void {
    if (!view) return;
    const top = view.getBoundingClientRect().top + window.scrollY;
    viewH = Math.round(window.innerHeight - top - BOTTOM_GAP);
  }
  $effect(() => {
    void preview;
    const later = window.setTimeout(fitHeight);
    return () => window.clearTimeout(later);
  });
  /* And again whenever the page around it changes height — the song's box
     grows once its text is in, a banner arrives after the source has been
     asked — or the sheet ran past the bottom of the window after it. The
     whole page is watched, not what stood above at first: a banner is a new
     element, and nothing watching the old ones sees it come. Refitting moves
     the page's height once more and then measures the same, and stops. */
  $effect(() => {
    const page = view?.closest('.main__inner');
    if (!page) return;
    const watching = new ResizeObserver(() => fitHeight());
    watching.observe(page);
    return () => watching.disconnect();
  });

  /* The small page that says which one is showing, kept in sight. */
  let thumbs: HTMLElement | undefined = $state();
  $effect(() => {
    const at = preview?.pageAt ?? 0;
    thumbs?.querySelectorAll<HTMLElement>('.print-view__thumb')[at]?.scrollIntoView({ block: 'nearest' });
  });

  /* The pages small, on the left: the same sheet drawn once more at a size a
     page is 84 px wide, with a button laid over each page to go to it. */
  const THUMB_W = 84;
  const PAGE_GAP_MM = 8;
  let thumbScale = $derived(preview
    ? THUMB_W / (paperSize(preview.settings.paper, preview.settings.orientation).width * PX_PER_MM) : 0);
  let thumbStep = $derived(preview
    ? (paperSize(preview.settings.paper, preview.settings.orientation).height + PAGE_GAP_MM) * PX_PER_MM * thumbScale : 0);
  let thumbH = $derived(preview
    ? paperSize(preview.settings.paper, preview.settings.orientation).height * PX_PER_MM * thumbScale : 0);

  const pdfLabel = (saved: SavedPdf): string =>
    `${new Date(saved.at).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${
      saved.paper.toUpperCase()} ${saved.orientation === 'landscape' ? t('ui.landscape') : t('ui.portrait')}`;

  /* The arrow keys turn the pages, anywhere in this view but in a field,
     where they move the caret or step a number. */
  function keys(event: KeyboardEvent): void {
    if (!preview || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const at = event.target as HTMLElement | null;
    if (at?.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    preview.showPage(preview.pageAt + (event.key === 'ArrowLeft' ? -1 : 1));
  }
</script>

<svelte:window onkeydown={keys} onresize={fitHeight} />

{#if preview}<div class="print-view" bind:this={view} style:--print-view-h={viewH === null ? null : `${viewH}px`}><!--
  The pages small. Drawn from the same plan as the big one, so they can never
  show a different break.
--><nav class="print-view__thumbs" aria-label={t('ui.pages')} bind:this={thumbs}>{#if preview.plan.pages}<div class="print-view__thumbsheet" style:height="{preview.pageCount * thumbStep}px"><div class="preview-scaler" style:transform="scale({thumbScale})"><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider={preview.options.provider} /></div>{#each Array.from({ length: preview.pageCount }) as _, at (at)}<button class="print-view__thumb" type="button" style:top="{at * thumbStep}px" style:height="{thumbH}px" aria-label={t('ui.page_n', { n: at + 1, total: preview.pageCount })} aria-pressed={preview.pageAt === at} onclick={() => preview?.showPage(at)}></button>{/each}</div>{/if}</nav><div class="print-view__stage">{#key preview}<!--
  Keyed by the preview, so a preview built again gets boxes of its own.
--><div class="preview-frame print-view__frame" role="region" aria-label={t('ui.sheet_preview')} bind:this={preview.frame}><div bind:this={preview.sizer}><div class="preview-scaler" bind:this={preview.scaler}><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider={preview.options.provider} /></div></div></div></div>{/key}<!--
  Under the sheet: which page is showing, and beside it the two things this
  view is for, right below what they print.
--><div class="print-view__bar"><Pager s={preview} /><span class="print-view__go">{#if preview.options.onPdf}<button class="btn primary" type="button" disabled={preview.saving || preview.preparing} onclick={() => preview?.savePdf()}>{#if preview.saving}<span class="spinner"></span> {t('ui.pdf_saving')}{:else}{t('ui.pdf_save')}{/if}</button>{/if}<button class="btn" type="button" disabled={preview.preparing} onclick={() => preview?.print()}>{#if preview.preparing}<span class="spinner"></span> {t('ui.preparing')}{:else}{t('ui.print')}{/if}</button></span></div></div><aside class="print-view__panel" aria-label={t('ui.sheet_column')}>{#if pdfs.length > 0}<div class="print-view__acts"><!--
  The latest PDF kept of this Sammlung, and the others folded under it.
--><p class="small print-view__last"><span class="faint">{t('ui.pdf_last')}</span> {pdfLabel(pdfs[0]!)} · <button class="linklike" type="button" onclick={() => void openSavedPdf(pdfs[0]!)}>{t('ui.pdf_open')}</button>{#if pdfs.length > 1} · <button class="linklike" type="button" aria-expanded={allPdfs} onclick={() => { allPdfs = !allPdfs; }}>{t('ui.pdf_all', { n: pdfs.length })}</button>{/if}</p>{#if allPdfs}<ul class="pdf-list" aria-label={t('ui.pdf_list_title')}>{#each pdfs as saved (saved.path)}<li><span class="small">{pdfLabel(saved)}</span><button class="btn quiet sm" type="button" onclick={() => void openSavedPdf(saved)}>{t('ui.pdf_open')}</button></li>{/each}</ul>{/if}</div>{/if}<PrintOptions s={preview} /></aside></div>{:else}<p class="small faint">{t('ui.nothing_to_print')}</p>{/if}
