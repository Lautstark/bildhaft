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
  import type { Collection } from '../core/types.ts';
  import type { CollectionKind } from '../core/types.ts';
  import { COLLECTION_KINDS, sentenceCaption, kindOf } from '../core/types.ts';
  import { editedLabel } from '../core/edited.ts';
  import { drawCollections } from '@lautstark/design/collections';
  import Icon from '../pieces/Icon.svelte';
  import Overflow from '@lautstark/design/svelte/Overflow';
  import { ordnerKey, sameOrdner } from '../core/ordner.ts';
  import {
    deleteOrdner, dropInOrdner, dropOnMaterial, handleNewOrdner, ordnerIn, renameOrdner,
  } from '../app/ordner.ts';
  import Logo from '../pieces/Logo.svelte';
  import { s } from '../app/state.svelte.ts';
  import { handleNewCollection, scheduleSearch, setActive } from '../app/collections.ts';
  import { handleNewTag } from '../app/words.ts';
  import { openAppSettings } from '../app/settings.ts';
  import { LOCALE, t } from '../i18n/index.ts';

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
     page-wide `.collections__item` silently means "a Material or a
     Wortschatz row, whichever comes first" - which is how three tests came
     to count „Alle Wörter" as a Material and one of them to click it. So each
     list sits in a section of its own, named by its class. */
  let searchInput: HTMLInputElement;

  let searching = $derived(s.query.trim().length > 0);
  /** Which lens is open, or `undefined` when a Material is showing instead. */
  let openTag = $derived(s.wortschatz ? s.wortschatz.tag : undefined);

  /* Written rather than bound, and only when it actually differs: the store is
     the authority on what was typed, and assigning the same string back into a
     field somebody has the caret in is how a search box loses its place. */
  $effect(() => { if (searchInput.value !== s.query) searchInput.value = s.query; });

  /**
   * How many Materialien before the list is sorted for finding.
   *
   * Five fit on a screen beside everything else and are found by looking. Past
   * that the list is put in two shapes: the five worked on last, which is most
   * of what anybody opens, and all of them grouped by template, which is how a
   * Lied is told from a Tafel without reading. Below it a „Zuletzt" would be
   * the same rows twice.
   */
  const RECENT = 5;
  let grouped = $derived(s.collections.length > RECENT);
  let groups = $derived(COLLECTION_KINDS
    .map((kind) => ({ kind, rows: s.collections.filter((c) => kindOf(c) === kind) }))
    .filter((group) => group.rows.length > 0));

  /**
   * What is open: only what holds the thing that is showing, and never
   * „Zuletzt" by itself.
   *
   * Everything else is folded, and nothing is remembered. A press on a heading
   * opens or folds it until something else is opened, and then the sidebar
   * folds back around that. Remembered folds were tried first and drifted: a
   * group opened once stayed open, and by the end of an afternoon the list was
   * as long as before it had groups.
   */
  let showingKind = $derived.by(() => {
    if (s.wortschatz) return null;
    const open = s.collections.find((c) => c.id === s.activeId);
    return open ? kindOf(open) : null;
  });
  const holds = (id: string): boolean => {
    if (id === 'words') return s.wortschatz !== null;
    if (id === 'collections') return showingKind !== null;
    /* „Zuletzt" waits to be asked: the open one is already lit in its group. */
    if (id === 'recent') return false;
    if (id.startsWith('ordner:')) {
      const open = s.collections.find((c) => c.id === s.activeId);
      const naming = s.renamingOrdner;
      return (!s.wortschatz && open !== undefined && id === ordnerId(kindOf(open), open.ordner ?? ''))
        || (naming !== null && id === ordnerId(naming.kind, naming.name));
    }
    if (s.renamingOrdner && id === groupId(s.renamingOrdner.kind)) return true;
    return id === groupId(showingKind ?? 'satzstreifen') && showingKind !== null;
  };
  let pressed = $state<Record<string, boolean>>({});
  $effect(() => {
    /* Read only to run again when they change. */
    void s.activeId; void s.wortschatz;
    pressed = {};
  });
  const isOpen = (id: string): boolean => pressed[id] ?? holds(id);
  const toggle = (id: string): void => { pressed = { ...pressed, [id]: !isOpen(id) }; };
  const groupId = (kind: CollectionKind) => `kind:${kind}`;
  const ordnerId = (kind: CollectionKind, name: string) => `ordner:${kind}:${ordnerKey(name)}`;
  const groupOpen = (kind: CollectionKind) => isOpen(groupId(kind));
  const toggleGroup = (kind: CollectionKind) => toggle(groupId(kind));

  /* The rows are @lautstark/design/collections'. It empties the container it
     is given, so that container is a node this component renders and never
     fills itself — the heading above it and the button under it are this
     sidebar's and are not shared, which is the line the package draws. The
     additive flag it reports is ignored because bildhaft opens one Material at
     a time (§4.2). An attachment rather than an effect over a bound node,
     because the groups come and go and each needs a host of its own. */
  const wordRows = (node: HTMLElement) => {
    drawCollections(node, {
      rows: [
        { id: '', name: t('ui.all_words'), count: s.wordCount },
        ...s.tagRows.map((tag) => ({ id: `#${tag.name}`, name: tag.name, count: tag.count })),
      ],
      open: openTag === undefined ? [] : [openTag === null ? '' : `#${openTag}`],
      onPick: (id: string) => openWords(id === '' ? null : id.slice(1)),
    });
  };

  /**
   * One list of Materialien. What it is and when it was last worked on, under
   * what it is called — except inside a template's group, which already says
   * the first. No count: how much is in a Material is said at its head once it
   * is open, and a number here read as 0 more often than it read right.
   */
  const materialRows = (list: Collection[], withKind: boolean) => (node: HTMLElement) => {
    drawCollections(node, {
      rows: list.map((collection) => ({
        id: collection.id,
        name: collection.name,
        subtitle: withKind ? `${t(`ui.template_${kindOf(collection)}`)} · ${edited(collection)}` : edited(collection),
      })),
      /* Nothing is open down here while the Wortschatz is showing. Two rows
         lit in two sections would say both are, and one of them is only the
         Material that will be there again when the person comes back. */
      open: openTag === undefined && s.activeId ? [s.activeId] : [],
      onPick: (id: string) => { s.wortschatz = null; setActive(id); s.query = ''; onNavigated(); },
    });
    /* Inside the groups a row can be dragged onto another or onto an Ordner.
       drawCollections draws one button per row, in order, and knows nothing
       of dragging, so the id is put on each here. */
    if (!grouped) return;
    [...node.querySelectorAll<HTMLElement>(':scope > .collections__item')].forEach((row, i) => {
      row.draggable = true;
      row.dataset.id = list[i]!.id;
    });
  };

  /*
   * Dragging a material in the sidebar (her pick „O3"): onto another of its
   * template makes an Ordner of the two — or puts it into the other's —, onto
   * an Ordner puts it in, onto its template's heading takes it out. Native
   * drag and drop, as the Tafel's fields have; the ⋯ beside the name does the
   * same without a mouse.
   */
  let dragging: string | null = null;
  const dropTarget = (event: DragEvent): HTMLElement | null =>
    (event.target as HTMLElement).closest<HTMLElement>('.collections__item[data-id], [data-drop-ordner], [data-drop-kind]');
  const clearDrop = (root: HTMLElement) => root.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  function dragStart(event: DragEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.collections__item[data-id]');
    if (!row || !event.dataTransfer) return;
    dragging = row.dataset.id!;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragging);
  }
  function dragOver(event: DragEvent): void {
    if (!dragging) return;
    clearDrop(event.currentTarget as HTMLElement);
    const target = dropTarget(event);
    if (!target || target.dataset.id === dragging) return;
    event.preventDefault();
    target.classList.add('drop-target');
  }
  function drop(event: DragEvent): void {
    clearDrop(event.currentTarget as HTMLElement);
    const moved = dragging;
    dragging = null;
    const target = dropTarget(event);
    if (!moved || !target) return;
    event.preventDefault();
    if (target.dataset.id) void dropOnMaterial(moved, target.dataset.id);
    else if (target.dataset.dropOrdner !== undefined) void dropInOrdner(moved, target.dataset.kind as CollectionKind, target.dataset.dropOrdner);
    else void dropInOrdner(moved, target.dataset.dropKind as CollectionKind, null);
  }

  /* The name of a new or renamed Ordner, typed in place: Enter or leaving
     the field keeps it, Escape keeps the old one. */
  function naming(node: HTMLInputElement): void { node.focus(); node.select(); }
  function nameKeys(event: KeyboardEvent, kind: CollectionKind, from: string): void {
    const field = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') { event.preventDefault(); void renameOrdner(kind, from, field.value); }
    if (event.key === 'Escape') { event.preventDefault(); void renameOrdner(kind, from, from); }
  }

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

  /* The Sammlung's own stamp, which moves when something is added to it,
     it is renamed, or its template, grid or print is changed. Not its rows':
     a row is written again whenever its symbols are looked up afresh, so a
     Sammlung nobody touched for a month read „heute" after a reload. */
  const edited = (collection: Collection): string => editedLabel(
    collection.updatedAt,
    Date.now(),
    {
      today: t('ui.edited_today'),
      yesterday: t('ui.edited_yesterday'),
      daysAgo: (n) => t('ui.edited_days', { n }),
      date: (at) => at.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    },
  );
</script>

<SharedSidebar id="sidebar" closeLabel={t('ui.close_menu')} {drawer} {collapsed} {ondismiss}
  >{#snippet brand(wired)}<Logo /><h1>bildhaft</h1><button class="btn quiet icon sidebar__collapse" type="button" {...wired} title={t('ui.hide_sidebar')} onclick={onCollapse}><Icon name="chevronLeft" /></button>{/snippet}{#snippet search()}<div class="sidebar__section"><!--
  Making something is the first thing the sidebar offers, above finding it, and
  outside every fold: at the foot of „Materialien" it went with the section
  when that was folded, and read as one more quiet line when it was not.
--><button class="btn sidebar__new" type="button" onclick={() => { s.wortschatz = null; s.query = ''; void handleNewCollection(); onNavigated(); }}>{t('ui.new_collection')}</button><input bind:this={searchInput} class="field" type="search" placeholder={t('ui.search_placeholder')} aria-label={t('ui.search_label')} oninput={(event) => { s.query = event.currentTarget.value; scheduleSearch(); }} /></div>{/snippet}{#snippet sections()}<!--
  What was worked on last, above everything: it is most of what anybody opens.
  Then the Wortschatz, above the Materialien.

  „Alle Wörter" is always there, including on the first day when it counts
  nothing: it is the door, and a section that appears only once somebody has
  done the thing it is the door to would never be found. „+ Neuer Tag" is not —
  a button to sort something that does not exist yet is a control that cannot
  do anything, so it waits until there is a word to sort.

  Every heading is a button that folds what is under it.
-->{#if !searching}{#if grouped}<div class="sidebar__section sidebar__section--recent"><h2>{@render fold('recent', t('ui.recent'))}</h2>{#if isOpen('recent')}<div class="collections" {@attach materialRows(s.collections.slice(0, RECENT), true)}></div>{/if}</div>{/if}{/if}<div class="sidebar__section sidebar__section--words">{#if !searching}<h2>{@render fold('words', t('ui.wortschatz'))}</h2>{#if isOpen('words')}<div class="collections" {@attach wordRows}></div>{#if s.wordCount > 0}<button class="btn quiet sm" style="margin-top:6px" type="button" onclick={() => { void handleNewTag(); onNavigated(); }}>{t('ui.new_tag')}</button>{/if}{/if}{/if}</div>{#if searching}<div class="sidebar__section sidebar__section--collections"><h2>{s.results.length === 1 ? t('ui.n_hits_one') : t('ui.n_hits', { n: s.results.length })}</h2><div class="list">{#each s.results as sentence (sentence.id)}<button class="hit" type="button" onclick={() => openResult(sentence.collectionId)}>{sentenceCaption(sentence)}<small>{where(sentence.collectionId)}</small></button>{/each}{#if s.results.length === 0}<p class="small faint" style="padding:0 10px">{t('ui.nothing_found')}</p>{/if}</div></div>{:else}<!-- svelte-ignore a11y_no_static_element_interactions --><div class="sidebar__section sidebar__section--collections" ondragstart={dragStart} ondragover={dragOver} ondrop={drop} ondragend={(event) => { dragging = null; clearDrop(event.currentTarget); }}><h2>{@render fold('collections', t('ui.collections'), grouped ? s.collections.length : undefined)}</h2>{#if isOpen('collections')}{#if grouped}{#each groups as group (group.kind)}<div class="sidebar__grouprow" data-drop-kind={group.kind}><button class="sidebar__group" type="button" aria-expanded={groupOpen(group.kind)} onclick={() => toggleGroup(group.kind)}><Icon name="chevronRight" /><span>{t(`ui.group_${group.kind}`)}</span></button><!--
  Der Gruppendruck: alles dieser Vorlage auf einmal, abwählbar in der
  Vorschau. Er steht links neben der Zahl, die bündig rechts bleibt wie bei
  „Materialien" — und zeigt sich erst dem Zeiger.
--><button class="sidebar__groupprint" type="button" aria-label={t('ui.group_print_of', { group: t(`ui.group_${group.kind}`) })} title={t('ui.group_print_of', { group: t(`ui.group_${group.kind}`) })} onclick={() => { s.groupPrint = { kind: group.kind }; onNavigated(); }}><Icon name="printer" /></button><span class="sidebar__count">{group.rows.length}</span></div>{#if groupOpen(group.kind)}{@const inside = ordnerIn(group.kind)}<div class="sidebar__group-rows"><!--
  Die Ordner der Vorlage oben, jeder wie eine Gruppe: aufklappen, drucken,
  sein ⋯ zum Umbenennen und Löschen. Darunter, was lose liegt, und zuletzt
  „+ Neuer Ordner" wie „+ Neuer Tag" unter dem Wortschatz.
-->{#each inside.ordner as ordner (ordnerKey(ordner.name))}{@const id = ordnerId(group.kind, ordner.name)}<div class="sidebar__grouprow sidebar__ordner" data-drop-ordner={ordner.name} data-kind={group.kind}>{#if s.renamingOrdner && s.renamingOrdner.kind === group.kind && sameOrdner(s.renamingOrdner.name, ordner.name)}<input class="field sidebar__ordnername" type="text" value={ordner.name} aria-label={t('ui.ordner_name')} use:naming onkeydown={(event) => nameKeys(event, group.kind, ordner.name)} onblur={(event) => void renameOrdner(group.kind, ordner.name, event.currentTarget.value)} />{:else}<button class="sidebar__group" type="button" aria-expanded={isOpen(id)} onclick={() => toggle(id)}><Icon name="chevronRight" /><span class="sidebar__ordner-ico"><Icon name="folder" /></span><span>{ordner.name}</span></button><Overflow class="btn quiet icon sidebar__ordnermenu" label={t('ui.ordner_actions', { name: ordner.name })} build={(add) => {
  add(t('ui.ordner_rename'), () => { s.renamingOrdner = { kind: group.kind, name: ordner.name }; });
  add(t('ui.ordner_delete'), () => void deleteOrdner(group.kind, ordner.name), { danger: true });
}}><Icon name="dots" /></Overflow><button class="sidebar__groupprint" type="button" aria-label={t('ui.ordner_print_of', { name: ordner.name })} title={t('ui.ordner_print_of', { name: ordner.name })} disabled={ordner.rows.length === 0} onclick={() => { s.groupPrint = { kind: group.kind, ordner: ordner.name }; onNavigated(); }}><Icon name="printer" /></button><span class="sidebar__count">{ordner.rows.length}</span>{/if}</div>{#if isOpen(id) && ordner.rows.length > 0}<div class="collections sidebar__group-rows" {@attach materialRows(ordner.rows, false)}></div>{/if}{/each}<div class="collections" {@attach materialRows(inside.loose, false)}></div><button class="btn quiet sm sidebar__new-ordner" type="button" onclick={() => handleNewOrdner(group.kind)}>{t('ui.new_ordner')}</button></div>{/if}{/each}{:else}<div class="collections" {@attach materialRows(s.collections, true)}></div>{/if}{/if}</div>{/if}{/snippet}{#snippet foot()}<button class="btn quiet sm" type="button" onclick={() => { openAppSettings(); onNavigated(); }}>{t('ui.settings')}</button>{/snippet}</SharedSidebar
><!--
  A section's heading, which is also what folds it.
-->{#snippet fold(id: string, label: string, count?: number)}<button class="sidebar__fold" type="button" aria-expanded={isOpen(id)} onclick={() => toggle(id)}><Icon name="chevronRight" /><span>{label}</span>{#if count !== undefined}<span class="sidebar__count">{count}</span>{/if}</button>{/snippet}
