<script lang="ts">
  /**
   * „Alle drucken": one print over a whole template group.
   *
   * The overlay lists the group's materials, every one ticked; what is ticked
   * is what prints, and the pages follow a tick at once. Each material's
   * sheets are exactly its own print — same settings, same colours, same
   * pages — so one ticked material is the single print, page for page. Only
   * the Kartenbögen move: where the template cuts cards (Spiel, Plauderbuch),
   * every material whose cards would print identically shares one Bogen at
   * the end, condensed; cards that differ (another paper, with instead of
   * without Beschriftung) keep a Bogen of their own.
   *
   * Nothing here writes: the previews take each material's kept settings and
   * change none of them, and the tick lives only in this overlay. The menu
   * under the list — the one over a single material — sets for every ticked
   * material at once, and for this print only (her call, 2026-10-29): what it
   * sets lies over each material's own and is forgotten when the overlay
   * closes. The list itself folds to one line, „4 von 4 Materialien" and
   * their names (her pick B).
   */
  import { untrack } from 'svelte';
  import type { GroupPrintWhich } from '../core/ordner.ts';
  import type { PrintSettings } from '../core/types.ts';
  import DingBar, { dd } from './DingBar.svelte';
  import PaperPick from './PaperPick.svelte';
  import PrintSheet from './PrintSheet.svelte';
  import { attachGroupPrinting, groupPdf, Printing } from './printDialog.svelte.ts';
  import { printerPaper } from './printSheet.ts';
  import { anybookOf, groupPrintLoad, groupPrintParts, groupPrintSource, pdfStem, type GroupLoaded } from '../app/print.ts';
  import { openStudioSheet } from './anyStudio.svelte.ts';
  import { download } from '@lautstark/werkzeuge/download';
  import { t } from '../i18n/index.ts';

  let { which, onClose }: { which: GroupPrintWhich; onClose: () => void } = $props();
  /* „Alle Tafeln drucken", or the Ordner by its name. */
  let caption = $derived(which.ordner === undefined
    ? t('ui.group_print_of', { group: t(`ui.group_${which.kind}`) })
    : t('ui.ordner_print_of', { name: which.ordner }));

  let loaded = $state.raw<GroupLoaded[] | null>(null);
  let chosen = $state.raw<ReadonlySet<string>>(new Set());
  $effect(() => {
    void which;
    untrack(() => {
      loaded = null;
      void groupPrintLoad(which).then((all) => {
        loaded = all;
        chosen = new Set(all.map(({ collection }) => collection.id));
      });
    });
  });
  const toggle = (id: string): void => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    chosen = next;
  };
  let listOpen = $state(false);

  /* What the menu set, over every material, for this print, and which settings it changed. */
  let over = $state.raw<Partial<PrintSettings>>({});
  let changed = $state.raw<ReadonlySet<keyof PrintSettings>>(new Set());
  let source = $derived(loaded ? groupPrintSource(loaded, chosen, over, (next, key) => {
    over = next;
    changed = new Set([...changed, key]);
  }) : null);
  const reset = (): void => { over = {}; changed = new Set(); };

  let parts = $derived(loaded ? groupPrintParts(loaded, chosen, over) : []);
  let previews = $derived(parts.map((part) => {
    const one = new Printing(part.options);
    /* All pages below one another at the overlay's width; the overlay scrolls. */
    one.fit = { kind: 'flow' };
    return one;
  }));
  /* A material's own pages, as its sheet came out; the shared Kartenbogen is nobody's. */
  const pagesOf = (id: string): number | null => {
    const at = parts.findIndex((part) => part.collection?.id === id);
    return at < 0 ? null : previews[at]?.pageCount ?? null;
  };
  $effect(() => {
    if (previews.length === 0) return;
    const current = previews;
    let detach: () => void = () => undefined;
    const later = window.setTimeout(() => { detach = attachGroupPrinting(current); });
    return () => { window.clearTimeout(later); detach(); };
  });

  let pageCount = $derived(previews.reduce((n, preview) => n + preview.pageCount, 0));
  let preparing = $derived(previews.some((preview) => preview.preparing));
  /* One print job is one @page: papers that differ cannot share it. The PDF
     can — each part keeps its own sheet there. */
  let papers = $derived(new Set(previews.map((preview) => {
    const sheet = printerPaper(preview.settings);
    return `${sheet.paper} ${sheet.orientation}`;
  })));
  let mixed = $derived(papers.size > 1);

  /* The materials that print Anybook codes carry a ◎ in the list; with one
     of them ticked the overlay saves a single Studio file of all it prints. */
  let anybook = $derived(new Set(loaded?.filter(({ collection }) => anybookOf(collection, over)).map(({ collection }) => collection.id)));
  let ticked = $derived(loaded?.filter(({ collection }) => chosen.has(collection.id)) ?? []);
  let withCodes = $derived(ticked.some(({ collection }) => anybook.has(collection.id)));
  let fileName = $derived(which.ordner ?? t(`ui.group_${which.kind}`));
  function studio(): void {
    openStudioSheet(previews, fileName,
      ticked.map(({ collection }) => ({ name: collection.name, anybook: anybook.has(collection.id) })));
  }

  let saving = $state(false);
  async function savePdf(): Promise<void> {
    if (saving || previews.length === 0) return;
    saving = true;
    try {
      const pdf = await groupPdf(previews);
      download(pdf, `${fileName} ${pdfStem(new Date(), previews[0]!.settings)}.pdf`);
    } finally {
      saving = false;
    }
  }
</script>

<!-- An Escape that closed a menu (it says so, defaultPrevented) leaves the overlay open. -->
<svelte:window onkeydown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose(); }} />

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="print-dock print-dock--big" aria-label={caption} onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
  <div class="print-view group-print">
    <div class="print-view__caprow">
      <span class="print-view__cap">{caption}</span>
      <span class="small faint">{t(pageCount === 1 ? 'ui.n_page' : 'ui.n_pages', { n: pageCount })}</span>
      <span class="print-view__sp"></span>
      {#if source}<PaperPick {source} />{/if}
      <button class="print-view__tool" type="button" aria-label={t('ui.preview_close')} title={t('ui.preview_close')} onclick={onClose}>✕</button>
    </div>
    {#if loaded}
      <div class="group-print__sum">
        <button class="group-print__fold" type="button" aria-expanded={listOpen} onclick={() => { listOpen = !listOpen; }}>{@render dd()}{t('ui.group_print_n_of', { n: chosen.size, all: loaded.length })}</button>
        {#if !listOpen}<span class="group-print__names small faint">{ticked.map(({ collection }) => collection.name).join(', ')}</span>{/if}
      </div>
      {#if listOpen}<div class="group-print__wahl" role="group" aria-label={t('ui.group_print_pick')}>
        <div class="group-print__head"><span class="small faint">{t('ui.group_print_pick')}</span><span class="print-view__sp"></span><button class="group-print__link" type="button" onclick={() => { chosen = new Set(loaded?.map(({ collection }) => collection.id)); }}>{t('ui.group_print_all')}</button><button class="group-print__link" type="button" onclick={() => { chosen = new Set(); }}>{t('ui.group_print_none')}</button></div>
        {#each loaded as { collection } (collection.id)}
          {@const pages = chosen.has(collection.id) ? pagesOf(collection.id) : null}
          <label class="ding-check group-print__check{chosen.has(collection.id) ? '' : ' group-print__check--aus'}">
            <input type="checkbox" checked={chosen.has(collection.id)} onchange={() => toggle(collection.id)} /><span class="group-print__name">{collection.name}{#if anybook.has(collection.id)}<span class="group-print__any" title={t('ui.group_print_anybook')} aria-label={t('ui.group_print_anybook')}>◎</span>{/if}</span>{#if pages}<span class="small faint">{t(pages === 1 ? 'ui.n_page' : 'ui.n_pages', { n: pages })}</span>{/if}
          </label>
        {/each}
      </div>{/if}
      {#if source}<div class="group-print__menu">
        <DingBar {source} />
        <span class="group-print__only small faint">{#if changed.size > 0}{t(changed.size === 1 ? 'ui.group_print_changed_one' : 'ui.group_print_changed_n', { n: changed.size })} · <button class="group-print__link" type="button" onclick={reset}>{t('ui.group_print_reset')}</button>{:else}{t('ui.group_print_only')}{/if}</span>
      </div>{/if}
      <div class="print-view__scroll"><div class="print-view__stage">
        {#key previews}
          {#each previews as preview, at (at)}
            <div class="preview-frame print-view__frame" role="region" aria-label={t('ui.sheet_preview')} bind:this={preview.frame}><div bind:this={preview.sizer}><div class="preview-scaler" bind:this={preview.scaler}><div style="width:fit-content" bind:this={preview.holder}><PrintSheet blocks={preview.blocks} plan={preview.plan} settings={preview.settings} provider={preview.options.provider} /></div></div></div></div>
          {/each}
        {/key}
        {#if previews.length === 0}<p class="small faint">{t('ui.nothing_to_print')}</p>{/if}
      </div></div>
      <div class="print-view__foot">
        {#if mixed}<span class="print-view__meta opt__warn">{t('ui.group_print_mixed')}</span>{/if}
        <span class="print-view__sp"></span>
        {#if withCodes}<button class="print-view__tool" type="button" title={t('ui.anybook_studio')} disabled={preparing || previews.length === 0} onclick={studio}>⤓ Anybook</button>{/if}
        <button class="print-view__tool" type="button" aria-label={t('ui.pdf_save')} title={t('ui.pdf_save')} disabled={saving || preparing || previews.length === 0} onclick={() => void savePdf()}>{#if saving}<span class="spinner"></span>{:else}⤓{/if} PDF</button>
        <button class="print-view__tool" type="button" disabled={preparing || mixed || previews.length === 0} onclick={() => previews[0]?.print()}>{#if preparing}<span class="spinner"></span>{/if} {t('ui.print')}</button>
      </div>
    {:else}
      <div class="print-view__scroll"><p class="small faint" style="padding:16px 2px">…</p></div>
    {/if}
  </div>
</div>
