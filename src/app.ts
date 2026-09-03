import type {
  AppSettings, Candidate, Collection, PrintSettings, ProviderId, Sentence, Slot,
} from './core/types.ts';
import { sentenceCaption } from './core/types.ts';
import { wanted } from '@lautstark/werkzeuge/sammlung';
import { setSymbolLanguage } from '@lautstark/bildquelle';
import { normalizeInput, splitLines } from '@lautstark/bildquelle/german';
import { LANG, t } from './i18n/index.ts';

import { buildSlots, refreshSlotChoices, resolveSlotsForProvider } from './core/match.ts';
import { getProvider, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { isBlockedByOtherTab, onBlockedChange, takeMigrationNote } from './db/db.ts';
import {
  clearEverything, countSentences, createCollection, deleteCollectionDeep,
  deleteSentence, findByNormalized, libraryTotals, listCollections, listSentences,
  loadSettings, newId, overrideMap, pruneOwnImages, putOverride, putOwnImage,
  listOverrides,
  onChanged, putSentence, renameCollection, saveCollectionProvider, saveSettings,
  searchSentences,
  pullFromFolder,
} from './db/repo.ts';
import {
  downloadCollectionExport, downloadJson, exportCollection, exportEverything,
  importCollectionFile,
} from './db/exportImport.ts';
import { Sicherung } from '@lautstark/sicherung';
import { ablage, adopted, folderName, watchFolder, wipeReaches } from './db/folder.ts';
import { renameField } from '@lautstark/design/rename';
import { announcer } from '@lautstark/design/toast';
import { el, fill, toggleClass } from './ui/dom.ts';
import { footer, sidebar, topBar } from './ui/chrome.ts';
import { composer } from './ui/composer.ts';
import { wortschatzView as makeWortschatz } from './ui/wortschatz.ts';
import { confirmDialog, openDialog } from './ui/dialog.ts';
import { sourceStatusLine } from './ui/symbolSources.ts';
import { icons, logo } from './ui/logo.ts';
import { actionMenu } from './ui/menu.ts';
import { openAbout, openDatenschutz, openImpressum } from './ui/info.ts';
import { openCollectionSource } from './ui/collectionSource.ts';
import { openPrintDialog } from './ui/printDialog.ts';
import { openSettings } from './ui/settingsDialog.ts';
import { offerRescue } from './ui/rescue.ts';
import { openSlotPicker } from './ui/slotPicker.ts';
import { sentenceRow, type RowView } from './ui/row.ts';
import { resetSymbolResolution } from './ui/symbols.ts';

/** Matches the `max-width: 820px` breakpoint used throughout the stylesheet. */
const MOBILE_QUERY = '(max-width: 820px)';

export function mountApp(root: HTMLElement): void {
  /* ------------------------------------------------------------ state --- */

  let settings: AppSettings | null = null;
  let collections: Collection[] = [];
  let counts: Record<string, number> = {};
  let activeId: string | null = null;
  /* Which of the two nouns the main area is showing. `null` is a Sammlung —
     `activeId` stays put while the Wortschatz is open, so leaving it comes
     back to the same one. adr/0002 has why there are two. */
  let wortschatz: { tag: string | null } | null = null;
  /** What the sidebar's Wortschatz rows count. Read with the Sammlungen. */
  let wordCount = 0;
  let tagRows: { name: string; count: number }[] = [];
  let sentences: Sentence[] = [];

  let draft = '';
  let reuse: Sentence | null = null;
  let busy = false;
  /* How far a pasted text has got. Null for a single line, whose spinner in the
     composer is the whole story — see handleSubmit. */
  let batch: { done: number; total: number } | null = null;

  let query = '';
  let results: Sentence[] = [];

  let picker: { sentenceId: string; slotId: string } | null = null;

  /*
   * Mobile navigation is deliberately NOT the persisted desktop preference.
   * Sharing one flag meant a sidebar left open on desktop loaded open on the
   * phone — and, when left closed, hid the only control that could reopen it.
   */
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  let isMobile = mobileQuery.matches;
  let mobileNavOpen = false;

  // A stale tab holding an older database version blocks the upgrade here, which
  // would otherwise present as symbols stuck loading with no explanation.
  let dbBlocked = false;

  /*
   * A METACOM folder grant is per site and per browsing session. The index is
   * cached, so the source can report itself ready while every actual file read
   * is refused — the app looks fine and every symbol is blank. Counting
   * unreadable symbols catches that, where asking the provider does not.
   */
  let unreadable = 0;
  /*
   * False until the first restore attempt finishes. Restoring is asynchronous,
   * so the source reports itself unready for a moment on every single load —
   * judging it before then flashed the warning on screen and took it away again.
   */
  let sourceSettled = false;

  /**
   * The source the rows on screen were last resolved against, so that a change
   * of source can be told from a redraw. Boot sets it to what the first paint
   * actually draws with; syncProvider() below is the only other writer.
   */
  let previousProvider: ProviderId = 'arasaac';

  const activeCollection = () => collections.find((c) => c.id === activeId) ?? null;

  /**
   * The symbol source the page is drawing in: the open collection's own answer,
   * or the default it follows when it has none.
   *
   * One function, because everything that shows a symbol already asked this one
   * — the rows, the picker, the print sheet, the banners, the pipeline that
   * fills a new sentence's slots. Moving the answer onto the collection is
   * therefore this line and nothing else, which is what keeps the page from
   * naming one source and rendering another.
   *
   * bildhaft opens exactly one collection at a time — `activeId` is one id, the
   * sidebar is handed `open: [activeId]`, and boot makes one when the library is
   * empty — so there is no case where "the collection you are in" is ambiguous.
   * That is why there is no `nextCollection()` here as there is in mitreden,
   * where two Sammlungen can be open at once and the answer has to be *none*.
   * The `?? settings` arm still earns its place: it is what a collection with no
   * answer of its own reads, which is most of them.
   */
  const providerId = (): ProviderId =>
    activeCollection()?.provider ?? settings?.activeProvider ?? 'arasaac';
  const provider = () => getProvider(providerId());
  /** True while the open collection is following the default rather than answering. */
  const followsDefault = () => !activeCollection()?.provider;

  /* ------------------------------------------------------------ chrome --- */

  const loading = el('div', { class: 'loading-state' }, el('span', { class: 'spinner' }));

  const sidebarView = sidebar({
    onSelect: (id) => { wortschatz = null; setActive(id); query = ''; closeNavOnMobile(); render(); },
    onNew: () => { wortschatz = null; void handleNewCollection(); closeNavOnMobile(); },
    onWords: (tag) => {
      wortschatz = { tag };
      query = '';
      wortschatzView.open(tag);
      closeNavOnMobile();
      render();
    },
    onNewTag: () => { void handleNewTag(); closeNavOnMobile(); },
    onSearchChange: (value) => { query = value; scheduleSearch(); render(); },
    onOpenResult: (sentence) => {
      setActive(sentence.collectionId);
      query = '';
      closeNavOnMobile();
      render();
    },
    onOpenSettings: () => { openAppSettings(); closeNavOnMobile(); render(); },
    onCollapse: () => toggleSidebar(),
  });

  const scrim = el('button', {
    class: 'scrim',
    attrs: { type: 'button', 'aria-label': t('ui.close_menu') },
    on: { click: () => { mobileNavOpen = false; render(); } },
  });

  const rail = el('div', { class: 'rail' },
    el('button', {
      class: 'btn quiet icon',
      attrs: { type: 'button', title: t('ui.show_sidebar') },
      on: { click: () => toggleSidebar() },
    }, icons.menu()),
    logo(22),
  );

  const topBarView = topBar(() => toggleSidebar());

  /* The Wortschatz is the other half of the sidebar and the other half of the
     main area. It is handed the same things a Sammlung's parts are handed —
     the source in force, a way to write settings, a way to say something —
     and nothing about the shell it sits in. */
  const wortschatzView = makeWortschatz({
    provider,
    providerId,
    pinned: () => settings?.pinnedTags ?? [],
    onPinned: (tags: string[]) => {
      if (settings) persistSettings({ ...settings, pinnedTags: tags });
    },
    onChanged: () => { void refreshCollections(); },
    onLens: (tag: string | null) => { wortschatz = { tag }; render(); },
    notify: (message: string) => notify(message),
  });

  const composerView = composer({
    onChange: (value) => { draft = value; scheduleReuseLookup(); render(); },
    onSubmit: () => void handleSubmit(),
    onReuse: () => void handleReuse(),
  });

  /* Which Sammlung a pending rename is for, captured on the keystroke rather
     than read when the write runs. Switching blurs the field and so writes
     first, which makes the two the same in practice — but the debounce is the
     one path where they could differ, and the id is free to capture. */
  let renaming: string | null = null;

  const titleInput = el('input', {
    class: 'title-input',
    attrs: { 'aria-label': t('ui.collection_name'), placeholder: t('ui.collection_name') },
    on: {
      /* The live echo, and only that: the name in the sidebar row and the top
         bar follow each keystroke. Writing it is design/rename's, on its own
         listener — which is why that package binds with addEventListener rather
         than taking the property, so the two can share one field. */
      input: () => {
        if (!activeId) return;
        renaming = activeId;
        const name = titleInput.value;
        collections = collections.map((c) => (c.id === activeId ? { ...c, name } : c));
        render();
      },
    },
  });

  /* Debounced while typing, written on blur and on Enter, and never written
     when the value has not moved — which this copy did on every visit to the
     field, because its blur flushed unconditionally. */
  const titleField = renameField(titleInput, (typed) => {
    if (!renaming) return undefined;
    return renameCollection(renaming, typed);
  });

  const rowCount = el('span', { class: 'small faint', style: { whiteSpace: 'nowrap' } });

  const printAll = el('button', {
    class: 'btn quiet sm',
    text: t('ui.print'),
    attrs: { type: 'button' },
    on: { click: () => openPrint(sentences.map((s) => s.id)) },
  });

  const collectionHead = el('div', { class: 'collection-head' },
    titleInput, rowCount, printAll,
    /* §3.6's order: the export first, what this Sammlung is set to under it,
       the delete last. The middle item is not an act on the Sammlung and that
       is the point — the menu holds what a Sammlung *is* as well as what can be
       done to it, because both are answered by which Sammlung it sits beside. */
    actionMenu(t('ui.collection_actions'), (add) => {
      add(t('ui.export_collection'), () => void handleExport(),
        { disabled: sentences.length === 0 });
      add(t('ui.symbol_source_menu'), () => openSourceSheet());
      add(t('ui.delete_collection'), () => void confirmDeleteCollection(), { danger: true });
    }),
  );

  const rowsHost = el('div', { class: 'rows' });
  const emptyState = el('div', { class: 'empty' },
    el('b', { text: t('ui.no_sentences') }),
    el('small', { html: t('ui.no_sentences_hint') }));

  /* The region the banners are drawn into — see the banners block below for
     why it is a region and they are not. Mounted here, once, and never taken
     out again; it sits where the banners used to be inserted, above the
     composer. Empty it is a block with no content and costs no room. */
  const bannerHost = el('div', { class: 'banners', attrs: { role: 'status' } });

  const inner = el('div', { class: 'main__inner' },
    bannerHost, composerView.node, collectionHead, rowsHost);

  const footerView = footer({
    onAbout: () => openAbout(() => undefined),
    onImpressum: () => openImpressum(() => undefined),
    onDatenschutz: () => openDatenschutz(() => undefined),
  });

  const main = el('main', { class: 'main' }, topBarView.node, inner, footerView.node);
  const appRoot = el('div', { class: 'app', attrs: { id: 'app-root' } });

  // Printable DOM lives outside #app-root, which @media print hides.
  const printRoot = el('div', { attrs: { id: 'print-root' } });

  fill(root, loading, printRoot);

  /* ----------------------------------------------------------- banners --- */

  /*
   * The banners live inside one permanent region rather than being live regions
   * themselves, and that is the same rule the toast is under (conventions.md
   * §3.8): a reader announces a change in something it was already watching.
   *
   * busyBanner used to carry role="status" itself, and the render set its text
   * and *then* inserted the node — so it entered the accessibility tree already
   * carrying the message and announced nothing, every time. The role read as
   * correct in the markup and in review, which is exactly how the toast's
   * version of this survived as long as it did.
   *
   * So the region is this host, mounted once below, and what changes is which
   * banner is inside it. An addition to a live region's subtree is a change,
   * which is what makes this work where the old arrangement could not. The
   * banners themselves carry no role: two regions nested inside each other
   * would announce twice.
   */
  const busyMessage = el('span', { style: { flex: '1' } });
  const busyBanner = el('div', { class: 'banner banner--busy' },
    el('span', { class: 'spinner' }), busyMessage);

  const unusableMessage = el('span', { style: { flex: '1' } });
  const regrant = el('button', {
    class: 'btn sm primary',
    text: t('ui.confirm_access'),
    attrs: { type: 'button' },
    on: {
      click: async () => {
        // Both need the click: re-granting and re-picking are gated on a user
        // gesture and cannot happen on load.
        const ok = await metacom.requestPermission().catch(() => false);
        if (!ok && MetacomProvider.supportsPersistentPicker) {
          await metacom.pickDirectory().catch(() => undefined);
        }
        // Re-granting alone changes nothing on screen: the symbols already gave
        // up and nothing about them has changed.
        resetSymbolResolution('metacom');
        unreadable = 0;
        render();
      },
    },
  });
  const unusableBanner = el('div', { class: 'banner', attrs: { role: 'alert' } },
    unusableMessage, regrant,
    el('button', { class: 'btn sm', text: t('ui.settings'),
      attrs: { type: 'button' }, on: { click: () => openAppSettings() } }),
  );

  const blockedBanner = el('div', { class: 'banner', attrs: { role: 'alert' }, text:
    t('ui.blocked_by_tab') });

  let bannerSignature = '';

  function renderBanners(): void {
    /*
     * Indexing a real METACOM folder walks tens of thousands of files and takes
     * seconds. The source is not ready during that, but it is not broken either —
     * showing the warning through it left the user looking at an unchanged alarm
     * with no sign that the folder they just picked was being read.
     */
    const status = metacom.status();
    const sourceBusy = providerId() === 'metacom' && status.kind === 'loading';
    /*
     * A pasted text, and how far through it we are.
     *
     * It shares the source's banner rather than getting one of its own: both
     * are the same sentence — something is working, wait — and the region below
     * shows one banner per kind. A single line does not raise it at all; its
     * spinner in the composer is over before there is anything to report, and a
     * banner that appears and vanishes within a second is noise.
     */
    const translating = batch !== null;
    /*
     * The active source cannot answer. For METACOM this is the normal state
     * after anything that resets a browser's per-site permissions — a new
     * address, cleared site data — because the folder grant is scoped to the
     * site, not to the app. Without this the only signal was "(nicht bereit)"
     * in grey next to the composer, while every row showed broken symbols and
     * offered nothing to click.
     */
    const sourceUnusable = sourceSettled && !sourceBusy
      && (!provider().isReady() || (providerId() === 'metacom' && unreadable >= 3));

    /* The source's own words win: a folder being read is why nothing is being
       looked up yet, which is the more useful half of the same wait. */
    if (status.kind === 'loading') busyMessage.textContent = sourceStatusLine(status);
    else if (batch) {
      busyMessage.textContent =
        t('ui.translating_lines', { n: Math.min(batch.done + 1, batch.total), total: batch.total });
    } else busyMessage.textContent = t('ui.one_moment');
    unusableMessage.textContent = providerId() === 'metacom'
      ? metacomWanted(status.kind === 'needs-setup' && status.code === 'no-folder')
      : t('ui.source_unavailable');
    toggleVisible(regrant, providerId() === 'metacom');

    const wanted: [string, HTMLElement][] = [];
    if (sourceBusy || translating) wanted.push(['busy', busyBanner]);
    if (sourceUnusable) wanted.push(['unusable', unusableBanner]);
    if (dbBlocked) wanted.push(['blocked', blockedBanner]);

    // Re-inserting an unchanged banner would restart its spinner animation.
    const signature = wanted.map(([key]) => key).join('|');
    if (signature === bannerSignature) return;
    bannerSignature = signature;

    // Into the region rather than into the page: the host stays, the contents
    // change. `replaceChildren` with the wanted set keeps the signature guard
    // above meaningful — an unchanged set returns before this line, so a
    // spinner that is still spinning is never restarted.
    bannerHost.replaceChildren(...wanted.map(([, node]) => node));
  }

  /**
   * The sentence for "METACOM is what this page is drawing in, and it cannot
   * draw". Which of the two it is matters, and so does who asked.
   *
   * bildhaft never quietly renders one source when another was asked for — the
   * page says the source is unavailable and shows nothing rather than filling
   * the rows with ARASAAC pictures under a collection that asked for METACOM.
   * A silent fall-back is the failure vorlaut met from the other side, where a
   * package baked pictures nobody had chosen.
   *
   * `noFolder` is the state that only became reachable when the source moved
   * onto the collection: restoring a backup onto a machine that has no METACOM
   * folder brings collections that ask for one. Confirming access is no use
   * there — nothing has been mislaid — so it says what is actually missing and
   * where the way out is.
   */
  function metacomWanted(noFolder: boolean): string {
    const own = !followsDefault();
    if (noFolder) {
      return `${t(own ? 'ui.metacom_missing_own' : 'ui.metacom_missing_default')} `
        + t('ui.metacom_missing_fix');
    }
    return t('ui.metacom_unreadable');
  }

  function toggleVisible(node: HTMLElement, on: boolean): void {
    node.style.display = on ? '' : 'none';
  }

  /* ------------------------------------------------------------- toast --- */

  /*
   * The toast is a live region, and the rule it lives under is
   * @lautstark/design/toast's: the node is mounted once, with the app, and
   * never taken out again - see render(), which is the only place root's
   * children are set. A reader announces a change in something it was already
   * watching, so a region that arrives already carrying its message announces
   * nothing at all.
   *
   * This product is why that module refuses a node it did not get handed. The
   * code here used to set the text, append the node, and remove it again 3.2
   * seconds later, and every acknowledgement the page made was silent: a saved
   * image, an exported Sammlung, a failed import, "Alle Daten gelöscht". The
   * words were on screen and correct the whole time, which is why nothing ever
   * looked wrong. mitreden had the same failure by a different route.
   *
   * What is bildhaft's rather than shared is what happens after: the line
   * empties, so the page goes quiet. Empty it paints nothing (`.toast:empty`
   * in app.css) and it is position:fixed besides, so it costs no room.
   *
   * conventions.md §3.8 is the rule and e2e/announce.spec.ts is this product's
   * copy of it; the module's own tests hold the half that is shared.
   */
  const toast = el('div', { class: 'toast', attrs: { role: 'status' } });
  const line = announcer(toast, {
    rest: 3200,
    onRest: (node) => { node.textContent = ''; },
  });

  // rests(), not say(): every message here fades, which is what makes the page
  // go quiet. vorlaut has both verbs on one line and mitreden uses neither.
  const notify = (message: string): void => { line.rests(message); };

  /* -------------------------------------------------------------- rows --- */

  const rowViews = new Map<string, { view: RowView; sentence: Sentence }>();

  /**
   * Whether these two records differ in the name and in nothing else.
   *
   * By reference where it can be, because `handleRename` is the only thing that
   * makes the second from the first and it copies the rest across untouched. A
   * field-by-field comparison would be a second description of the row, kept in
   * step by hand; this asks the one question that matters — is anything the row
   * draws from a different object than it was.
   */
  const renamedOnly = (before: Sentence, after: Sentence): boolean =>
    before.title !== after.title
    && before.slots === after.slots
    && before.rawInput === after.rawInput
    && before.collectionId === after.collectionId;

  function renderRows(): void {
    if (sentences.length === 0) {
      for (const { view } of rowViews.values()) view.destroy();
      rowViews.clear();
      rowsHost.replaceChildren();
      if (rowsHost.isConnected) inner.replaceChild(emptyState, rowsHost);
      return;
    }
    if (emptyState.isConnected) inner.replaceChild(rowsHost, emptyState);

    const seen = new Set<string>();
    const nodes: HTMLElement[] = [];

    for (const sentence of sentences) {
      seen.add(sentence.id);
      const existing = rowViews.get(sentence.id);
      // Rebuilding a row throws away its resolved symbols, so only rebuild when
      // the sentence itself was replaced.
      if (existing && existing.sentence === sentence) {
        nodes.push(existing.view.node);
        continue;
      }
      /* A rename is the one replacement that draws the same row — same symbols,
         same order, same captions — and the one where a rebuild would be felt,
         because the name is typed into the row itself. So the row takes the new
         record instead of being made again from it. */
      if (existing && renamedOnly(existing.sentence, sentence)) {
        existing.view.rename(sentence);
        rowViews.set(sentence.id, { view: existing.view, sentence });
        nodes.push(existing.view.node);
        continue;
      }
      existing?.view.destroy();
      const view = sentenceRow(sentence, providerId(), {
        onOpenSlot: (slotId) => openPicker(sentence.id, slotId),
        onAddSlot: () => void handleAddSlot(sentence.id),
        onReorder: (from, to) => void handleReorder(sentence.id, from, to),
        onUnreadableSymbol: (id) => void noteUnreadable(id),
        onPrint: () => openPrint([sentence.id]),
        onDelete: () => void confirmDeleteSentence(sentence),
        onRename: (title) => void handleRename(sentence.id, title),
      });
      rowViews.set(sentence.id, { view, sentence });
      nodes.push(view.node);
    }

    for (const [id, { view }] of rowViews) {
      if (!seen.has(id)) { view.destroy(); rowViews.delete(id); }
    }

    place(rowsHost, nodes);
  }

  /**
   * Puts exactly these children in this parent, and does nothing at all when
   * they are already there. Re-inserting an unchanged node blurs whatever inside
   * it had focus, which turned typing a collection name into one character per
   * click.
   */
  function place(parent: HTMLElement, children: HTMLElement[]): void {
    const same = parent.childNodes.length === children.length
      && children.every((child, i) => parent.childNodes[i] === child);
    if (!same) parent.replaceChildren(...children);
  }

  /* ------------------------------------------------------------ render --- */

  let lastSentenceCount = -1;

  function render(): void {
    if (!settings) return;
    // The toast goes in here, with the app, and stays for the life of the page:
    // this is the only call that sets root's children, and it runs once. It is
    // a sibling of appRoot rather than a child because appRoot's own children
    // are replaced on every render (see place() below), and a live region that
    // is swapped out between messages is the bug notify() documents.
    if (!appRoot.isConnected) fill(root, appRoot, printRoot, toast);

    const sidebarOpen = isMobile ? mobileNavOpen : settings.sidebarOpen;
    toggleClass(appRoot, 'app--collapsed', !sidebarOpen);
    toggleClass(appRoot, 'app--nav-open', isMobile && mobileNavOpen);

    const children: HTMLElement[] = [sidebarView.node];
    if (isMobile && mobileNavOpen) children.push(scrim);
    if (!sidebarOpen) children.push(rail);
    children.push(main);
    place(appRoot, children);

    sidebarView.render({
      collections, counts, activeId, searchQuery: query, searchResults: results,
      wordCount, tags: tagRows, openTag: wortschatz ? wortschatz.tag : undefined,
    });

    /* The two nouns share `.main__inner` and never overlap: one of them has the
       composer, the head and the wall of things, and the other has its own
       three. Rebuilding the list rather than hiding it keeps the symbol
       subscriptions of whichever is off screen from being kept alive.

       The last child is whichever of the two `renderRows` would put there, and
       naming it here rather than letting that function swap it afterwards is
       the whole of it. Both used to manage this one slot with different ideas
       of what belongs in it: this asked for `rowsHost`, `renderRows` replaced
       it with `emptyState` a few lines later, and so on the next render
       `place` found a fourth child it had not put there, concluded the list
       had changed and rebuilt all four. `collectionHead` went out with them,
       and with it the focus of anything inside it - which is why the name
       field of a new Sammlung was focused and then silently was not. */
    place(inner, wortschatz
      ? [bannerHost, ...wortschatzView.parts]
      : [bannerHost, composerView.node, collectionHead,
         sentences.length === 0 ? emptyState : rowsHost]);
    if (wortschatz) {
      topBarView.setTitle(wortschatz.tag ?? t('ui.all_words'));
      return;
    }

    const collection = activeCollection();
    topBarView.setTitle(collection?.name ?? 'bildhaft');
    /* Through refresh() rather than by assigning. The value comparison this
       used to be is not the same guard: it holds only because the input handler
       above echoes each keystroke into `collections` first, so a render caused
       by anything else — a store refresh landing mid-word — would compare
       against the stored name and put it back over what is being typed.
       refresh() declines on focus and on a pending keystroke instead. */
    titleField.refresh(collection?.name ?? '');

    composerView.render({
      value: draft, busy, reuse,
      providerName: provider().name,
      providerReady: provider().isReady(),
      inCollection: Boolean(collection),
      providerOwned: !followsDefault(),
    });

    rowCount.textContent = sentences.length === 1
      ? t('ui.n_rows_one')
      : t('ui.n_rows', { n: sentences.length });
    printAll.toggleAttribute('disabled', sentences.length === 0);
    footerView.setAttribution(provider().attribution);

    renderBanners();
    renderRows();

    if (sentences.length !== lastSentenceCount) {
      lastSentenceCount = sentences.length;
      void refreshCollections();
    }
  }

  /* ------------------------------------------------------------ backup --- */

  /*
   * The standing backup. `exportEverything` is what it is handed and the only
   * thing it is ever handed — that function is the audited artefact, carrying
   * symbol references and the user's own pictures, and never an ARASAAC or
   * METACOM pixel. A chosen folder may well sit inside Dropbox, so what goes
   * in it leaves the machine; tests/unit/backup-payload.test.ts holds this wiring in
   * place, and a failure there is a licensing problem rather than a bug.
   */
  const backup = new Sicherung({
    app: 'bildhaft',
    produce: exportEverything,
    // Nothing in this browser. @lautstark/sicherung v1.3.0 holds a write that
    // would put that over a folder holding the real thing, and this line is
    // what tells it — the package knows nothing about collections or
    // sentences, deliberately, and would have to be told their names to guess.
    //
    // This is the product it actually happened to: on 2026-08-28 the site
    // moved to bildhaft.lautstark.tech, per-origin storage meant the new
    // address opened empty, and bildhaft-aktuell.json went from three
    // collections to zero. The dated copy from five days earlier is what was
    // left. Overrides are not counted: they hang off collections and mean
    // nothing without them.
    looksEmpty: (produced) => {
      const it = produced as { collections?: unknown[]; sentences?: unknown[] };
      return it.collections?.length === 0 && it.sentences?.length === 0;
    },
  });

  // Every write to the library, from anywhere, through the one notifier in
  // repo.ts. Debounced inside Sicherung, so a burst of edits is one file.
  onChanged(() => backup.schedule());

  /* -------------------------------------------------------------- boot --- */

  void (async () => {
    /* Before anything is read. Where a folder is the store it is the truth, and a
       first paint from the browser's copy would be a library that changes under
       somebody a moment later. */
    await ablage.restore().catch(() => null);
    await pullFromFolder().catch(() => false);

    const loaded = await loadSettings();
    let all = await listCollections();

    if (all.length === 0) all = [await createCollection()];

    const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0];

    settings = loaded;
    // Before anything resolves a symbol: the preference orders search results,
    // so a slot filled in ahead of it would be filled from the wrong rendering.
    metacom.preferRendering(loaded.metacomRendering);
    collections = all;
    /* What the first paint draws with, recorded before setActive() can compare
       against it. Without this the initial guess is 'arasaac' and every load of
       a library whose source is METACOM would re-resolve and rewrite every
       sentence in the open collection — work that changes nothing. */
    previousProvider = wanted.provider ?? loaded.activeProvider;
    setActive(wanted.id);
    render();

    // Only judge the symbol source once it has had its chance to come back.
    metacom.restore().catch(() => undefined).finally(() => { sourceSettled = true; render(); });

    /* Where the work already lives in a folder, the dated copies go beside it.
       The store fills `<folder>/bildhaft/` and these are flat files above it, so
       the two never meet — and nobody is asked to pick a second folder that reads
       almost exactly like the first.

       Otherwise as before: never prompts, because there is no gesture here. A
       folder that needs its permission re-confirmed lands in needs-permission and
       says so in the panel, which is where the click can happen. */
    const alreadyHeld = ablage.handle();
    if (alreadyHeld) void backup.useFolder(alreadyHeld).catch(() => undefined);
    else backup.restore().catch(() => undefined);

    /* Somebody else's edit, arriving as a file that changed under this browser.
       Only once the folder is the store: a folder mid-adoption changes
       constantly, and all of those changes are ours. */
    void adopted().then((yes: boolean) => {
      if (yes) watchFolder(() => void pullFromFolder().then(() => {
        void refreshCollections();
        if (activeId) setActive(activeId);
      }));
    });

    /*
     * What the upgrade did, if it did anything. adr/0001: an upgrade that
     * reorganised somebody's storage without saying so is indistinguishable,
     * from where they are standing, from one that lost something.
     *
     * Said here rather than from inside db.ts, and after the first render, for
     * two reasons: notify() writes into a toast that render() is what mounts,
     * and the count of Sammlungen is the one number a person can check the
     * claim against — so it is worth saying once the library it counts is on
     * screen behind it.
     */
    const carried = takeMigrationNote();
    if (carried) {
      notify(carried.collections === 1
        ? t('ui.db_carried_one', { from: carried.from, to: carried.to })
        : t('ui.db_carried', { from: carried.from, to: carried.to, n: carried.collections }));
    }

    // Last, and after the first render: this may add a Sammlung and open it,
    // and notify() writes into a toast that render() is what mounts.
    await openNamed();
  })().catch((error: unknown) => {
    /*
     * Boot had no catch at all until adr/0001, and the failure it was missing
     * is the one that ADR is about: a database this build cannot read left
     * every await here hanging, and the page sat on its spinner with no
     * message. Two answers, and which one it is matters — a refusal means the
     * records are all still there and the person is owed them as a file, which
     * is what the sheet does. Everything else is an ordinary failure to open a
     * database, and it gets a sentence rather than silence.
     */
    if (offerRescue(error, { report: sayInsteadOfLoading, again: () => location.reload() })) return;
    sayInsteadOfLoading(t('ui.db_failed', {
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  /** In place of the spinner, which is all there is on screen this early.
   *
   * After the first render the spinner is gone and the toast is up, so the
   * message goes there instead — the same sentence either way, in whichever of
   * the two is actually on the page. */
  function sayInsteadOfLoading(message: string): void {
    if (loading.isConnected) {
      loading.replaceChildren(el('p', { class: 'banner', attrs: { role: 'alert' }, text: message }));
    } else {
      notify(message);
    }
  }

  /*
   * Whenever METACOM becomes usable again — a folder picked, a zip read,
   * permission re-granted — every symbol has to be told to try again. Nothing
   * about a slot changes when access returns, so without this the ones that had
   * already given up stay blank and the recovery looks like it did nothing.
   */
  let wasReady = metacom.isReady();
  metacom.subscribe(() => {
    const nowReady = metacom.isReady();
    if (nowReady && !wasReady) {
      resetSymbolResolution('metacom');
      // Forget the old failures too, or the warning outlives the problem.
      unreadable = 0;
    }
    wasReady = nowReady;
    render();
  });

  onBlockedChange(() => { dbBlocked = isBlockedByOtherTab(); render(); });

  mobileQuery.addEventListener('change', () => { isMobile = mobileQuery.matches; render(); });

  /* ------------------------------------------------------- persistence --- */

  function persistSettings(next: AppSettings): void {
    const renderingChanged = settings?.metacomRendering !== next.metacomRendering;
    settings = next;
    void saveSettings(next);
    if (renderingChanged) {
      metacom.preferRendering(next.metacomRendering);
      void repointToRendering();
    }
    render();
  }

  /*
   * A new preference is about every row already on screen, not only the next
   * sentence: each slot holds the right symbol in the wrong rendering. Asking
   * the source again is what moves them, and re-resolving the symbols is what
   * makes the change visible — nothing about a slot's id changes on its own.
   */
  async function repointToRendering(): Promise<void> {
    const collectionId = activeId;
    if (!collectionId || providerId() !== 'metacom') return;

    busy = true;
    render();
    try {
      const overrides = await overrideMap('metacom');
      const updated = await Promise.all((await listSentences(collectionId)).map(
        async (sentence) => ({
          ...sentence,
          slots: await refreshSlotChoices(sentence.slots, getProvider('metacom'), overrides),
        })));
      for (const sentence of updated) await putSentence(sentence);
      sentences = updated;
      resetSymbolResolution('metacom');
    } finally {
      busy = false;
      render();
    }
  }

  function setActive(id: string): void {
    /* Nothing from the last one stays on screen.
     *
     * The rows below are replaced when listSentences() answers, which for a
     * local read is a frame — except where what follows is long, and after an
     * import it is: the symbols of a Sammlung that has just arrived all have to
     * be resolved. Until then the head carried the new name over the previous
     * Sammlung's rows, which does not read as "loading", it reads as those rows
     * being what this Sammlung contains. */
    if (activeId !== id) sentences = [];
    activeId = id;
    /* The symbol search follows the Sammlung, not the page.
     *
     * main.ts sets this once from LANG, and that is right for a page somebody
     * is writing in. It is wrong for a Sammlung that arrived from somewhere
     * else: a German one opened by somebody reading the interface in English
     * had „Zähne putzen" looked up at the English endpoint, which does not
     * refuse an English word — it answers one — so every correction they tried
     * to make found the wrong picture or none.
     *
     * The interface stays in the language they chose. bildquelle keys its cache
     * and its in-flight map by language and passes the language down through a
     * search rather than reading it again at the end, so moving this while the
     * page is open is a thing that module was built for.
     */
    setSymbolLanguage(collections.find((c) => c.id === id)?.language ?? LANG);
    if (settings && settings.lastCollectionId !== id) {
      settings = { ...settings, lastCollectionId: id };
      void saveSettings(settings);
    }
    void listSentences(id).then((loaded) => {
      if (activeId !== id) return;
      sentences = loaded;
      unreadable = 0;
      render();
      /* Opening a collection can change the source, because the collection is
         where the answer lives now. Its rows may never have been resolved
         against that source, and an unresolved slot draws as an empty field
         rather than as a symbol.

         resolveOpen() and not syncProvider(), which is the fix: syncProvider
         returns at once when the source has not moved — and a Sammlung that has
         just arrived from somebody else has rows that were never resolved for
         this source *whether or not it moved*. That is how an imported Sammlung
         drawn in METACOM opened entirely blank for a reader on ARASAAC, and the
         other way round. resolveSlotsForProvider leaves a slot alone once it has
         a choice, so this costs nothing in the ordinary case. */
      void resolveOpen();
    });
  }

  async function refreshCollections(): Promise<void> {
    const all = await listCollections();
    const entries = await Promise.all(
      all.map(async (c) => [c.id, await countSentences(c.id)] as const));
    collections = all;
    counts = Object.fromEntries(entries);

    /* The Wortschatz counts come from the same pass, because they change for
       the same reasons: a correction in a Sammlung files a word, and the row
       above the Sammlungen has to say so without anybody opening it. */
    const words = await listOverrides();
    wordCount = words.length;
    const held = new Map<string, number>();
    for (const word of words) {
      for (const tag of word.tags ?? []) {
        held.set(tag.toLowerCase(), (held.get(tag.toLowerCase()) ?? 0) + 1);
      }
    }
    tagRows = (settings?.pinnedTags ?? [])
      .map((name) => ({ name, count: held.get(name.toLowerCase()) ?? 0 }));

    sidebarView.render({
      collections, counts, activeId, searchQuery: query, searchResults: results,
      wordCount, tags: tagRows, openTag: wortschatz ? wortschatz.tag : undefined,
    });
  }

  /**
   * Makes a tag and opens it, the way „+ Neue Sammlung" makes a Sammlung.
   *
   * It exists the moment it is made, before it has a name anybody chose and
   * before a single word carries it — which is what `pinnedTags` is for, and
   * why the name is edited in the work head rather than asked for in a dialog
   * (§1.5). The number is only there so that making three in a row does not
   * produce three rows called the same thing.
   */
  async function handleNewTag(): Promise<void> {
    if (!settings) return;
    const taken = new Set(settings.pinnedTags.map((tag) => tag.toLowerCase()));
    let name = t('ui.new_tag_name');
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${t('ui.new_tag_name')} ${n}`;

    persistSettings({ ...settings, pinnedTags: [...settings.pinnedTags, name] });
    wortschatz = { tag: name };
    query = '';
    wortschatzView.open(name);
    await refreshCollections();
    render();
    wortschatzView.nameIt();
  }

  /*
   * The collection name auto-saves like everything else. Saving only on blur would
   * lose the name if the tab is closed or reloaded while the field still has focus.
   */
  /* ------------------------------------------------- reuse suggestion --- */

  let reuseTimer = 0;

  function scheduleReuseLookup(): void {
    window.clearTimeout(reuseTimer);
    const normalized = normalizeInput(draft);
    if (!normalized) {
      reuse = null;
      return;
    }
    reuseTimer = window.setTimeout(async () => {
      const hits = await findByNormalized(normalized);
      const hit = hits.find((h) => h.slots.length > 0) ?? null;
      if (normalizeInput(draft) === normalized) { reuse = hit; render(); }
    }, 320);
  }

  /* ------------------------------------------------------------ search --- */

  let searchTimer = 0;

  function scheduleSearch(): void {
    window.clearTimeout(searchTimer);
    if (!query.trim()) {
      results = [];
      return;
    }
    searchTimer = window.setTimeout(() => {
      void searchSentences(query).then((hits) => { results = hits; render(); });
    }, 200);
  }

  /* ------------------------------------------------------------ submit --- */

  /**
   * How many lines are translated at the same time.
   *
   * Four rather than all of them. A line is a chain of lookups — one per word,
   * each waiting on the one before it — so a pasted song spent its whole time
   * with a single request in flight and the page empty: 24 lines of a children's
   * song took eight seconds against a 150 ms endpoint, and a picture book takes
   * minutes. Four keeps four requests moving without turning a paste into a
   * burst at a free public service, which is the same restraint the cache is
   * there for.
   */
  const LINES_AT_ONCE = 4;

  /**
   * Puts a row where its age says it goes.
   *
   * The list is sorted newest first and translations no longer land in the
   * order they were started, so a row cannot simply go on the front. createdAt
   * is what fixes the order — it counts down through the batch — and reading it
   * back here is what lets a line that finished early wait for its place.
   */
  function placeRow(sentence: Sentence): void {
    const at = sentences.findIndex((s) => s.createdAt < sentence.createdAt);
    sentences = at === -1
      ? [...sentences, sentence]
      : [...sentences.slice(0, at), sentence, ...sentences.slice(at)];
  }

  async function handleSubmit(): Promise<void> {
    const raw = draft.trim();
    const collectionId = activeId;
    if (!raw || !settings || !collectionId || busy) return;

    const lines = splitLines(raw);
    if (lines.length === 0) return;

    busy = true;
    /*
     * The box is emptied now, not at the end. A pasted text is the case where
     * the wait is long enough to read as a hang, and a box still holding the
     * words is the strongest sign nothing happened. Whatever fails to translate
     * is put back below, so nothing is lost by clearing it early.
     */
    draft = '';
    reuse = null;
    batch = lines.length > 1 ? { done: 0, total: lines.length } : null;
    render();

    const now = Date.now();
    /*
     * The lines still owed a row. A line is struck off the moment its row is
     * written, so whatever is left at the end — a word the source could not be
     * asked about, or a failure before the first line was even started — is
     * exactly what goes back into the box.
     */
    const owed = [...lines];
    let firstError: unknown = null;

    try {
      const options = {
        provider: provider(),
        stopwords: new Set(settings.stopwords[LANG]),
        overrides: await overrideMap(providerId()),
      };

      /*
       * Each line is written and drawn as it comes back, rather than the whole
       * batch appearing at the end. That is what a long text needed: the rows
       * fill in from the top while the rest is still being looked up, and the
       * first corrections can be made before the last line has arrived.
       */
      const translate = async (line: string, index: number): Promise<void> => {
        try {
          const sentence: Sentence = {
            id: newId(),
            normalizedInput: normalizeInput(line),
            rawInput: line,
            slots: await buildSlots(line, options),
            collectionId,
            /*
             * Descending within the batch. The list is sorted newest first, so
             * this is what keeps the lines in the order they were typed — which
             * is also the order they get printed in.
             */
            createdAt: now - index,
            updatedAt: now,
          };
          await putSentence(sentence);
          delete owed[index];
          if (activeId === collectionId) placeRow(sentence);
        } catch (err) {
          firstError ??= err;
        }
        if (batch) batch = { ...batch, done: batch.done + 1 };
        render();
      };

      let next = 0;
      await Promise.all(Array.from({ length: Math.min(LINES_AT_ONCE, lines.length) },
        async () => {
          while (next < lines.length) {
            const index = next++;
            await translate(lines[index], index);
          }
        }));
    } catch (err) {
      firstError ??= err;
    } finally {
      busy = false;
      batch = null;
      /* Back into the box, in the order they were written. A book whose tenth
         line has no symbols must not take the ninety after it down with it. */
      const left = [...owed].filter(Boolean);
      if (left.length > 0) draft = left.join('\n');
      if (firstError !== null) {
        notify(firstError instanceof Error ? firstError.message : t('ui.translate_failed'));
      }
      render();
    }
  }

  async function handleReuse(): Promise<void> {
    if (!reuse || !activeId) return;
    const now = Date.now();
    const sentence: Sentence = {
      ...reuse,
      id: newId(),
      slots: reuse.slots.map((slot) => ({ ...slot, id: newId() })),
      collectionId: activeId,
      createdAt: now,
      updatedAt: now,
    };
    await putSentence(sentence);
    sentences = [sentence, ...sentences];
    draft = '';
    reuse = null;
    render();
  }

  /* ------------------------------------------------------- row editing --- */

  /**
   * One edit to a sentence at a time, in the order the edits were made.
   *
   * The picker can settle a field while an earlier edit to the same field is
   * still being written — type a caption, then press a symbol — and a handler
   * that read the store before the write in front of it had landed built its
   * change on the slot as it was, putting the earlier edit back.
   *
   * Queueing rather than updating the store first, because "what the row shows
   * has been written" is worth keeping: there is no undo here and no server to
   * ask, so an edit that is visible but not yet saved is one a reload can eat.
   * A failed write drops out of the queue and does not stall the ones behind it.
   */
  let writes: Promise<unknown> = Promise.resolve();

  function queued<T>(fn: () => Promise<T>): Promise<T> {
    const run = writes.then(fn, fn);
    writes = run.catch(() => undefined);
    return run;
  }

  async function updateSentence(next: Sentence): Promise<void> {
    await putSentence(next);
    sentences = sentences.map((s) => (s.id === next.id ? next : s));
    render();
  }

  /**
   * Names a row, or takes the name off it again.
   *
   * Trimming is decided here rather than in the bound field, which hands over
   * exactly what was typed — bildhaft has somewhere to show an unnamed row, so
   * an empty name is allowed and means the typed line.
   */
  function handleRename(sentenceId: string, title: string): Promise<void> {
    return queued(async () => {
      const sentence = sentences.find((s) => s.id === sentenceId);
      if (!sentence) return;
      const next = title.trim();
      if (next === (sentence.title?.trim() ?? '')) return;
      // Empty is stored as absent, so "never named" and "name cleared" stay
      // the one state rather than two that read alike.
      await updateSentence({ ...sentence, title: next || null });
    });
  }

  /** Reads the sentence inside the queue, so it sees the edit before it. */
  function mutateSlots(sentenceId: string, fn: (slots: Slot[]) => Slot[]): Promise<void> {
    return queued(async () => {
      const sentence = sentences.find((s) => s.id === sentenceId);
      if (!sentence) return;
      await updateSentence({ ...sentence, slots: fn(sentence.slots) });
    });
  }

  function openPicker(sentenceId: string, slotId: string): void {
    const slot = sentences.find((s) => s.id === sentenceId)?.slots.find((sl) => sl.id === slotId);
    if (!slot) return;
    picker = { sentenceId, slotId };
    openSlotPicker(slot, providerId(), {
      onChoose: (candidate) => void handleChoose(candidate),
      onOwnImage: (picture, name) => void handleOwnImage(picture, name),
      onClearOwnImage: () => void handleClearOwnImage(),
      onNegate: (negated) => void handleNegate(negated),
      onLabel: (label) => void handleLabel(label),
      onRemove: () => void handleRemoveSlot(),
      onClose: () => void handleClosePicker(),
    });
  }

  async function handleChoose(candidate: Candidate): Promise<void> {
    if (!picker) return;
    // The field is settled now; which field it was has to be taken now too,
    // because the work below waits its turn behind any edit still in flight.
    const { sentenceId, slotId } = picker;
    picker = null;

    await queued(async () => {
      const sentence = sentences.find((s) => s.id === sentenceId);
      const slot = sentence?.slots.find((sl) => sl.id === slotId);
      if (!sentence || !slot) return;

      const isNew = !slot.concept;
      const nextSlot: Slot = {
        ...slot,
        // A slot added by hand takes its word from the chosen symbol.
        sourceToken: isNew ? candidate.label : slot.sourceToken,
        concept: isNew ? candidate.label.toLowerCase() : slot.concept,
        // Either way a human chose this, so say so. Leaving the pipeline's origin
        // in place made the tooltip claim a lemma lookup had picked the symbol.
        origin: 'manual',
        choice: { ...slot.choice, [providerId()]: candidate.id },
        candidates: {
          ...slot.candidates,
          [providerId()]: mergeCandidate(slot.candidates[providerId()] ?? [], candidate),
        },
      };

      await updateSentence({
        ...sentence,
        slots: sentence.slots.map((sl) => (sl.id === slot.id ? nextSlot : sl)),
      });

      if (!isNew) {
        // Remember the correction under both the typed word and the resolved concept,
        // so it fires again whether the same surface form or a variant shows up.
        const keys = new Set([slot.sourceToken.toLowerCase(), slot.concept.toLowerCase()]);
        for (const key of keys) {
          if (key.trim()) await putOverride(providerId(), key, candidate);
        }
      }
    });
  }

  /*
   * A picture of the user's own goes in whole: the bytes are copied into
   * bildhaft, so the file it came from is free to move or disappear. The slot
   * keeps whatever symbol it had underneath, and removing the picture later
   * uncovers it rather than leaving an empty field.
   */
  async function handleOwnImage(picture: Blob, name: string): Promise<void> {
    if (!picker) return;
    const { sentenceId, slotId } = picker;
    picker = null;

    await queued(async () => {
      const sentence = sentences.find((s) => s.id === sentenceId);
      const slot = sentence?.slots.find((sl) => sl.id === slotId);
      if (!sentence || !slot) return;

      try {
        const image = await putOwnImage(picture, name);
        await updateSentence({
          ...sentence,
          slots: sentence.slots.map((sl) => (sl.id === slotId ? {
            ...sl,
            ownImage: image.id,
            // A field added by hand takes its word from the file it was given.
            sourceToken: sl.sourceToken || stemOf(name),
            concept: sl.concept || stemOf(name).toLowerCase(),
            origin: 'manual' as const,
          } : sl)),
        });
        notify(t('ui.own_picture_saved'));
      } catch {
        notify(t('ui.own_picture_failed'));
      }
    });
  }

  async function handleClearOwnImage(): Promise<void> {
    if (!picker) return;
    const { sentenceId, slotId } = picker;
    picker = null;
    await mutateSlots(sentenceId, (slots) =>
      slots.map((sl) => (sl.id === slotId ? { ...sl, ownImage: null } : sl)));
    // The picture itself only goes once nothing points at it any more.
    await pruneOwnImages();
    resetSymbolResolution();
  }

  /*
   * Unlike every other picker outcome this one leaves `picker` alone: crossing a
   * symbol out does not settle the dialog, so the field it refers to has to
   * still be the one the dialog is editing when the next toggle arrives.
   */
  async function handleNegate(negated: boolean): Promise<void> {
    if (!picker) return;
    const { sentenceId, slotId } = picker;
    await mutateSlots(sentenceId, (slots) =>
      slots.map((sl) => (sl.id === slotId ? { ...sl, negated } : sl)));
  }

  /*
   * Like negation, a rewording leaves the dialog open, so `picker` stays put:
   * the field being edited has to still be the one the next keystroke means.
   *
   * An empty field is stored as null rather than as '', because "" and "no
   * wording of its own" are the same state and only one of them should be
   * capable of being written to disk.
   */
  async function handleLabel(label: string): Promise<void> {
    if (!picker) return;
    const { sentenceId, slotId } = picker;
    const next = label.trim() || null;
    await mutateSlots(sentenceId, (slots) =>
      slots.map((sl) => (sl.id === slotId ? { ...sl, label: next } : sl)));
  }

  async function handleRemoveSlot(): Promise<void> {
    if (!picker) return;
    const { sentenceId, slotId } = picker;
    picker = null;
    await mutateSlots(sentenceId, (slots) => slots.filter((sl) => sl.id !== slotId));
  }

  async function handleAddSlot(sentenceId: string): Promise<void> {
    const slot: Slot = {
      id: newId(),
      sourceToken: '',
      concept: '',
      origin: 'manual',
      choice: {},
      candidates: {},
    };
    await mutateSlots(sentenceId, (slots) => [...slots, slot]);
    openPicker(sentenceId, slot.id);
  }

  async function handleReorder(sentenceId: string, from: number, to: number): Promise<void> {
    await mutateSlots(sentenceId, (slots) => {
      const next = [...slots];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** Discard a hand-added slot the user never filled. */
  async function handleClosePicker(): Promise<void> {
    if (!picker) return;
    const slot = sentences
      .find((s) => s.id === picker!.sentenceId)
      ?.slots.find((sl) => sl.id === picker!.slotId);
    if (slot && !slot.concept) await handleRemoveSlot();
    picker = null;
  }

  /* --------------------------------------------------- provider change --- */

  async function syncProvider(): Promise<void> {
    if (previousProvider === providerId()) return;
    previousProvider = providerId();
    await resolveOpen();
  }

  /**
   * Fills in the symbol source this person actually uses, for every sentence in
   * the open Sammlung.
   *
   * resolveSlotsForProvider() leaves a slot alone once it has a choice for that
   * provider, so this is cheap where there is nothing to do and is the whole
   * job where there is.
   *
   * **Two callers, and the second is why this is a function.** A provider change
   * is the obvious one. The other is an import: a file carries the choices of
   * whoever made it, and a Sammlung drawn in METACOM opened by somebody with
   * ARASAAC — or the reverse — arrived entirely blank. Nothing was wrong with
   * the file; every slot simply had no choice for the source in front of them,
   * and nothing ever asked. That is the case this whole concept-and-choice shape
   * exists for, and it was the one case not wired up.
   */
  async function resolveOpen(): Promise<void> {
    if (!activeId) return;

    busy = true;
    render();
    try {
      const overrides = await overrideMap(providerId());
      const current = await listSentences(activeId);
      const updated = await Promise.all(current.map(async (sentence) => ({
        ...sentence,
        slots: await resolveSlotsForProvider(sentence.slots, getProvider(providerId()), overrides),
      })));
      for (const sentence of updated) await putSentence(sentence);
      sentences = updated;
    } finally {
      busy = false;
      render();
    }
  }

  /* ----------------------------------------------------------- actions --- */

  async function handleNewCollection(): Promise<void> {
    const created = await createCollection();
    await refreshCollections();
    sentences = [];
    setActive(created.id);
    render();

    /* Straight into the name, selected: the first keystroke replaces the date
     * it was given. conventions.md §1.5, and the selecting is the half of it
     * that was missing here — the name was invented and then left as a chore to
     * delete, which is the difference between a suggestion and a default.
     *
     * After render(), because that is what puts the new name in the field, and
     * it does it through refresh() like every other assignment. refresh()
     * declines while the field has focus, and it does not have it here: the
     * press that got us here took focus to the button in the sidebar. So the
     * order is render, then take it. */
    titleInput.focus();
    titleInput.select();
  }

  async function handleExport(): Promise<void> {
    const collection = activeCollection();
    if (!collection) return;
    downloadCollectionExport(await exportCollection(collection));
    notify(t('ui.collection_exported'));
  }

  /**
   * A Sammlung the address names.
   *
   *     …/bildhaft/?sammlung=saetze-zum-drucken
   *
   * A link on <https://lautstark.tech/sammlungen/> lands somebody here with the
   * sentences already in front of them. The reading half — the parameter, the
   * id check, the fetch — is `@lautstark/werkzeuge/sammlung`, shared with
   * vorlaut and mitreden: the address names an entry and never a URL, because a
   * parameter holding an address turns a link into „fetch whatever this says
   * and import it", and what gets imported is read to a child.
   *
   * There is no check here that the file is ours. handleImport() hands it to
   * importCollectionFile(), which refuses anything that is not a bildhaft file
   * by name — one refusal, in the words the file picker already uses.
   *
   * Never rejects: this runs in boot, where a rejection would be read as the
   * page having failed to open.
   */
  async function openNamed(here?: string): Promise<void> {
    const asked = here === undefined ? await wanted() : await wanted(here);
    switch (asked.kind) {
      case 'none':
        return;
      case 'unknown':
        notify(t('ui.shelf_unknown'));
        return;
      case 'offline':
        notify(t('ui.shelf_offline', { error: asked.error.message }));
        return;
      case 'file':
        // The same path „Sammlung einlesen" takes, down to the toast it writes
        // and the collection it opens afterwards.
        await handleImport(asked.file);
    }
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const result = await importCollectionFile(file);
      await refreshCollections();
      // setActive() resolves what it opens against the source in front of the
      // reader, which is what a file from somebody else needs.
      setActive(result.collection.id);
      // Built from parts rather than from one sentence per shape: the three
      // facts are independently present or absent, and a key per combination
      // is eight keys in two languages for one line of a toast.
      notify([
        result.collectionCount > 1
          ? t('ui.n_collections', { n: result.collectionCount }) : null,
        result.sentenceCount === 1
          ? t('ui.import_done_one') : t('ui.import_done', { n: result.sentenceCount }),
        result.overrideCount > 0
          ? t('ui.n_overrides', { n: result.overrideCount }) : null,
      ].filter(Boolean).join(' · '));
    } catch (err) {
      notify(err instanceof Error ? err.message : t('ui.file_unreadable'));
    }
  }

  async function confirmDeleteSentence(sentence: Sentence): Promise<void> {
    const ok = await confirmDialog({
      title: t('ui.delete_row_title'),
      body: t('ui.row_will_be_removed', { text: sentenceCaption(sentence) }),
      confirmLabel: t('ui.delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteSentence(sentence.id);
    sentences = sentences.filter((s) => s.id !== sentence.id);
    render();
  }

  async function confirmDeleteCollection(): Promise<void> {
    const collection = activeCollection();
    if (!collection) return;
    const count = sentences.length;
    const ok = await confirmDialog({
      title: t('ui.delete_collection'),
      // The confirmation names the collection and the row count, deliberately.
      body: t('ui.collection_will_be_deleted', { name: collection.name, n: count }),
      confirmLabel: count === 1 ? t('ui.delete_n_rows_one') : t('ui.delete_n_rows', { n: count }),
      danger: true,
    });
    if (!ok) return;

    await deleteCollectionDeep(collection.id);
    const remaining = (await listCollections()).filter((c) => c.id !== collection.id);
    await refreshCollections();
    if (remaining[0]) { sentences = []; setActive(remaining[0].id); render(); }
    else await handleNewCollection();
  }

  function openPrint(ids: string[]): void {
    const byId = new Map(sentences.map((s) => [s.id, s]));
    const chosen = ids.map((id) => byId.get(id)).filter((s): s is Sentence => Boolean(s));
    if (chosen.length === 0 || !settings) return;

    openPrintDialog({
      sentences: chosen,
      collectionName: activeCollection()?.name ?? 'bildhaft',
      settings: settings.print,
      onChange: (print: PrintSettings) => { if (settings) persistSettings({ ...settings, print }); },
      provider: providerId(),
      attribution: provider().attribution,
      onClose: () => undefined,
    });
  }

  /**
   * The Sammlung's own sheet. Nothing is confirmed and nothing is saved on the
   * way out: each press is written through, the rows behind are re-resolved
   * against the new source, and the page says what just happened to them.
   */
  function openSourceSheet(): void {
    const collection = activeCollection();
    if (!collection || !settings) return;
    openCollectionSource({
      collection,
      rowCount: sentences.length,
      fallback: settings.activeProvider,
      onPick: (choice) => handlePickSource(collection.id, choice),
    });
  }

  async function handlePickSource(id: string, choice: ProviderId | null): Promise<void> {
    await saveCollectionProvider(id, choice);
    /* Read back rather than patched in place: `provider` is absent for "follow
       the default", and an object carrying `provider: undefined` is a different
       thing from one without the key when it is written out again. */
    await refreshCollections();
    if (activeId !== id) { render(); return; }

    render();
    // The same re-resolution a change of default runs, for the same reason: a
    // slot that has never been resolved against this source has no symbol under
    // it, and would draw as an empty field rather than as a picture.
    await syncProvider();

    const named = getProvider(providerId()).name;
    notify(choice === null
      ? t('ui.collection_follows_default', { name: collectionName(id), source: named })
      : t('ui.collection_uses_source', { name: collectionName(id), source: named }));
  }

  const collectionName = (id: string) =>
    collections.find((c) => c.id === id)?.name ?? t('ui.collection');

  function openAppSettings(): void {
    if (!settings) return;
    openSettings({
      settings,
      onChange: persistSettings,
      onProviderChanged: () => { void syncProvider(); render(); },
      onFolderChanged: () => { void refreshCollections(); if (activeId) setActive(activeId); },
      openCollectionProvider: () => activeCollection()?.provider ?? null,
      onNotify: notify,
      onExportAll: async () => {
        downloadJson(await exportEverything(), LANG === 'de' ? 'sicherung' : 'backup');
        notify(t('ui.backup_exported'));
      },
      backup,
      onImport: (file) => void handleImport(file),
      onClearAll: () => void confirmClearAll(),
      onClose: () => render(),
    });
  }

  /* How far this goes depends on where the work lives, and the difference is not
     a nicety: with a folder as the store, clearEverything() removes the files, so
     it removes them on every device the household has. With the folder out of
     reach it is refused — a wipe there empties this browser, leaves the folder
     whole, and hands everything back on the next start. */
  async function confirmClearAll(): Promise<void> {
    const reach = wipeReaches();
    const folder = folderName();

    if (reach === 'unreachable') {
      const sheet = openDialog({
        title: t('ui.clear_all_blocked_title'),
        body: [t('ui.clear_all_blocked', { folder })],
        footer: [el('button', {
          class: 'btn primary', text: t('ui.understood'),
          attrs: { type: 'button' }, on: { click: () => sheet.close() },
        })],
      });
      return;
    }

    const totals = await libraryTotals();
    const ok = await confirmDialog({
      title: t('ui.delete_all_button'),
      body:
        t('ui.clear_all_body', {
          collections: totals.collections, sentences: totals.sentences,
          entries: totals.overrides,
        }) + (reach === 'folder' ? t('ui.clear_all_reach', { folder }) : ''),
      confirmLabel: t('ui.delete_everything'),
      danger: true,
      /* The one act in this product that asks for a word. It empties the library
         on every device the household has; design.md §4.3 says this is what the
         friction is for, and that spending it anywhere else is what breaks it. */
      requireTyping: t('ui.clear_all_word'),
      typingLabel: t('ui.clear_all_type'),
    });
    if (!ok) return;

    await clearEverything();
    const fresh = await createCollection();
    await refreshCollections();
    sentences = [];
    setActive(fresh.id);
    notify(t('ui.all_data_deleted'));
    render();
  }

  /* --------------------------------------------------------- unreadable --- */

  async function noteUnreadable(id: string): Promise<void> {
    if (providerId() !== 'metacom') return;
    /*
     * A symbol the current folder simply does not contain is missing, not
     * unreadable — that is the ordinary result of pointing at a differently
     * organised folder, and it must not be reported as the folder being
     * unreadable. Only count symbols the index still knows about.
     */
    const known = await metacom.labelFor(id).catch(() => null);
    if (known) { unreadable += 1; render(); }
  }

  /** On mobile the panel overlays the content, so acting on it should dismiss it. */
  function closeNavOnMobile(): void {
    if (isMobile) mobileNavOpen = false;
  }

  function toggleSidebar(): void {
    if (!settings) return;
    if (isMobile) mobileNavOpen = !mobileNavOpen;
    else persistSettings({ ...settings, sidebarOpen: !settings.sidebarOpen });
    render();
  }
}

/** "Bente-Sommer 2026.jpg" -> "Bente-Sommer 2026". The filename is the only label a photo has. */
function stemOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || t('ui.picture');
}

function mergeCandidate(candidates: Candidate[], candidate: Candidate): Candidate[] {
  if (candidates.some((c) => c.id === candidate.id)) return candidates;
  // Keep a manually searched pick in the list so it stays offered next time.
  return [candidate, ...candidates].slice(0, 8);
}
