<script lang="ts">
  /**
   * bildhaft's side of `@lautstark/design/svelte/Sidebar`. conventions.md §6.3.
   *
   * The component owns the `<aside>`, the brand row, the drawer's `✕`, the foot,
   * the `aria-expanded`/`aria-controls` wiring and the 820px breakpoint. What is
   * here is everything that is bildhaft's: the mark and the collapse chevron
   * inside the brand row, the search field, both lists of rows, and the way out
   * to Einstellungen.
   *
   * **The section seam is one snippet, and that is bildhaft's doing.** The `<h2>`
   * is part of what a search swaps — „Sammlungen" becomes *n* Treffer — so a
   * component-owned heading would have to be swapped by a component that knows
   * nothing about searching, and a component-owned wrapper around the first
   * section would leave an empty section and a 20px gap while a search is
   * running. Drawing the sections here is also what keeps
   * `.sidebar__section--words` and `--collections`, which have no CSS rule at all
   * and exist purely so ten e2e selectors can tell the two lists of rows apart.
   *
   * **The collapse chevron stays here**, inside the brand row as its third flex
   * child — which is why the component hands the brand snippet the wiring rather
   * than drawing a chevron of its own. The `✕` beside it is the component's, and
   * is drawn below the breakpoint only.
   */
  import SharedSidebar from '@lautstark/design/svelte/Sidebar';
  import { sentenceCaption, kindOf } from '../core/types.ts';
  import { drawCollections } from '@lautstark/design/collections';
  import Icon from '../pieces/Icon.svelte';
  import Logo from '../pieces/Logo.svelte';
  import { s } from '../app/state.svelte.ts';
  import { handleNewCollection, scheduleSearch, setActive } from '../app/collections.ts';
  import { handleNewTag } from '../app/words.ts';
  import { openAppSettings } from '../app/settings.ts';
  import { t } from '../i18n/index.ts';

  let {
    onNavigated,
    onCollapse,
    drawer = false,
    collapsed = false,
    ondismiss,
  }: {
    onNavigated: () => void;
    onCollapse: () => void;
    /** The drawer, below 820px. Ignored above it by the component. */
    drawer?: boolean;
    /** The remembered collapse, above 820px. §1.3. */
    collapsed?: boolean;
    /** The drawer's `✕`, which is the component's. */
    ondismiss?: () => void;
  } = $props();

  /* Both lists are drawn by drawCollections and so both emit
     `.collections__item`: the row is the same row, and sharing it is the
     point. What was missing is a way to say *which* list, and without it a
     page-wide `.collections__item` silently means "a Sammlung or a
     Wortschatz row, whichever comes first" - which is how three tests came
     to count „Alle Wörter" as a Sammlung and one of them to click it. */
  let wordRowsHost: HTMLElement | undefined = $state();
  let rowsHost: HTMLElement | undefined = $state();
  let searchInput: HTMLInputElement;

  let searching = $derived(s.query.trim().length > 0);
  /** Which lens is open, or `undefined` when a Sammlung is showing instead. */
  let openTag = $derived(s.wortschatz ? s.wortschatz.tag : undefined);

  /* The rows are @lautstark/design/collections'. It empties the container it
     is given, so that container is a node this component renders and never
     fills itself — the heading above it and the button under it are this
     sidebar's and are not shared, which is the line the package draws. The
     additive flag it reports is ignored because bildhaft opens one Sammlung at
     a time (§4.2) — which v1.17.0 separated from how many a line may be *in*
     (§4.1), the question this comment used to answer and the one that is now
     one everywhere. */
  /* Written rather than bound, and only when it actually differs: the store is
     the authority on what was typed, and assigning the same string back into a
     field somebody has the caret in is how a search box loses its place. */
  $effect(() => { if (searchInput.value !== s.query) searchInput.value = s.query; });

  $effect(() => {
    if (!wordRowsHost) return;
    drawCollections(wordRowsHost, {
      rows: [
        { id: '', name: t('ui.all_words'), count: s.wordCount },
        ...s.tagRows.map((tag) => ({ id: `#${tag.name}`, name: tag.name, count: tag.count })),
      ],
      open: openTag === undefined ? [] : [openTag === null ? '' : `#${openTag}`],
      onPick: (id: string) => openWords(id === '' ? null : id.slice(1)),
    });
  });

  $effect(() => {
    if (!rowsHost) return;
    drawCollections(rowsHost, {
      rows: s.collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        count: s.counts[collection.id] ?? 0,
        /* What it is, under what it is called. Eleven Sammlungen in a list
           look alike, and which of them is the Tafel and which the strips
           is a question the list can answer without being opened. Every
           row says it, the Satzstreifen too — a line that only some rows
           have reads as a warning on those. */
        subtitle: t(`ui.template_${kindOf(collection)}`),
      })),
      /* Nothing is open down here while the Wortschatz is showing. Two rows
         lit in two sections would say both are, and one of them is only the
         Sammlung that will be there again when the person comes back. */
      open: openTag === undefined && s.activeId ? [s.activeId] : [],
      onPick: (id: string) => { s.wortschatz = null; setActive(id); s.query = ''; onNavigated(); },
    });
  });

  function openWords(tag: string | null): void {
    s.wortschatz = { tag };
    s.query = '';
    onNavigated();
  }

  function openResult(collectionId: string): void {
    setActive(collectionId);
    s.query = '';
    onNavigated();
  }

  const where = (collectionId: string) =>
    s.collections.find((c) => c.id === collectionId)?.name ?? '—';
</script>

<SharedSidebar id="sidebar" closeLabel={t('ui.close_menu')} {drawer} {collapsed} {ondismiss}
  >{#snippet brand(wired)}<Logo /><h1>bildhaft</h1><button class="btn quiet icon sidebar__collapse" type="button" {...wired} title={t('ui.hide_sidebar')} onclick={onCollapse}><Icon name="chevronLeft" /></button>{/snippet}{#snippet search()}<div class="sidebar__section"><input bind:this={searchInput} class="field" type="search" placeholder={t('ui.search_placeholder')} aria-label={t('ui.search_label')} oninput={(event) => { s.query = event.currentTarget.value; scheduleSearch(); }} /></div>{/snippet}{#snippet sections()}<!--
  The Wortschatz, above the Sammlungen.

  „Alle Wörter" is always there, including on the first day when it counts
  nothing: it is the door, and a section that appears only once somebody has
  done the thing it is the door to would never be found. „+ Neuer Tag" is not —
  a button to sort something that does not exist yet is a control that cannot
  do anything, so it waits until there is a word to sort.
--><div class="sidebar__section sidebar__section--words">{#if !searching}<h2>{t('ui.wortschatz')}</h2><div class="collections" bind:this={wordRowsHost}></div>{#if s.wordCount > 0}<button class="btn quiet sm" style="margin-top:6px" type="button" onclick={() => { void handleNewTag(); onNavigated(); }}>{t('ui.new_tag')}</button>{/if}{/if}</div>{#if searching}<div class="sidebar__section sidebar__section--collections"><h2>{s.results.length === 1 ? t('ui.n_hits_one') : t('ui.n_hits', { n: s.results.length })}</h2><div class="list">{#each s.results as sentence (sentence.id)}<button class="hit" type="button" onclick={() => openResult(sentence.collectionId)}>{sentenceCaption(sentence)}<small>{where(sentence.collectionId)}</small></button>{/each}{#if s.results.length === 0}<p class="small faint" style="padding:0 10px">{t('ui.nothing_found')}</p>{/if}</div></div>{:else}<div class="sidebar__section sidebar__section--collections"><h2>{t('ui.collections')}</h2><div class="collections" bind:this={rowsHost}></div><button class="btn quiet sm" style="margin-top:6px" type="button" onclick={() => { s.wortschatz = null; void handleNewCollection(); onNavigated(); }}>{t('ui.new_collection')}</button></div>{/if}{/snippet}{#snippet foot()}<button class="btn quiet sm" type="button" onclick={() => { openAppSettings(); onNavigated(); }}>{t('ui.settings')}</button>{/snippet}</SharedSidebar
>
