import type {
  AppSettings, Candidate, Collection, PrintSettings, Sentence, Slot,
} from './core/types.ts';
import { normalizeInput, splitLines } from '@lautstark/bildquelle/german';
import { buildSlots, refreshSlotChoices, resolveSlotsForProvider } from './core/match.ts';
import { getProvider, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { isBlockedByOtherTab, onBlockedChange } from './db/db.ts';
import {
  clearEverything, countSentences, createCollection, deleteCollectionDeep,
  deleteSentence, findByNormalized, libraryTotals, listCollections, listSentences,
  loadSettings, newId, overrideMap, pruneOwnImages, putOverride, putOwnImage,
  onChanged, putSentence, renameCollection, saveSettings, searchSentences,
} from './db/repo.ts';
import {
  downloadCollectionExport, downloadJson, exportCollection, exportEverything,
  importCollectionFile,
} from './db/exportImport.ts';
import { Sicherung } from '@lautstark/sicherung';
import { renameField } from '@lautstark/design/rename';
import { el, fill, toggleClass } from './ui/dom.ts';
import { footer, sidebar, topBar } from './ui/chrome.ts';
import { composer } from './ui/composer.ts';
import { confirmDialog } from './ui/dialog.ts';
import { icons, logo } from './ui/logo.ts';
import { actionMenu } from './ui/menu.ts';
import { openAbout, openDatenschutz, openImpressum } from './ui/info.ts';
import { openPrintDialog } from './ui/printDialog.ts';
import { openSettings } from './ui/settingsDialog.ts';
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
  let sentences: Sentence[] = [];

  let draft = '';
  let reuse: Sentence | null = null;
  let busy = false;

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

  const providerId = () => settings?.activeProvider ?? 'arasaac';
  const provider = () => getProvider(providerId());
  const activeCollection = () => collections.find((c) => c.id === activeId) ?? null;

  /* ------------------------------------------------------------ chrome --- */

  const loading = el('div', { class: 'loading-state' }, el('span', { class: 'spinner' }));

  const sidebarView = sidebar({
    onSelect: (id) => { setActive(id); query = ''; closeNavOnMobile(); render(); },
    onNew: () => { void handleNewCollection(); closeNavOnMobile(); },
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
    attrs: { type: 'button', 'aria-label': 'Menü schließen' },
    on: { click: () => { mobileNavOpen = false; render(); } },
  });

  const rail = el('div', { class: 'rail' },
    el('button', {
      class: 'btn quiet icon',
      attrs: { type: 'button', title: 'Seitenleiste einblenden' },
      on: { click: () => toggleSidebar() },
    }, icons.menu()),
    logo(22),
  );

  const topBarView = topBar(() => toggleSidebar());

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
    attrs: { 'aria-label': 'Name der Sammlung', placeholder: 'Name der Sammlung' },
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
    text: 'Drucken',
    attrs: { type: 'button' },
    on: { click: () => openPrint(sentences.map((s) => s.id)) },
  });

  const collectionHead = el('div', { class: 'collection-head' },
    titleInput, rowCount, printAll,
    actionMenu('Aktionen für diese Sammlung', (add) => {
      add('Sammlung exportieren', () => void handleExport(),
        { disabled: sentences.length === 0 });
      add('Sammlung löschen', () => void confirmDeleteCollection(), { danger: true });
    }),
  );

  const rowsHost = el('div', { class: 'rows' });
  const emptyState = el('div', { class: 'empty' },
    el('b', { text: 'Noch keine Sätze' }),
    el('small', { html: 'Tippe oben einen Satz und drücke <kbd>Enter</kbd>.' }));

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
    text: 'Zugriff bestätigen',
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
    el('button', { class: 'btn sm', text: 'Einstellungen',
      attrs: { type: 'button' }, on: { click: () => openAppSettings() } }),
  );

  const blockedBanner = el('div', { class: 'banner', attrs: { role: 'alert' }, text:
    'bildhaft ist noch in einem anderen Tab geöffnet und blockiert die '
    + 'Aktualisierung der Datenbank. Schließe die anderen Tabs und lade diese '
    + 'Seite neu.' });

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
     * The active source cannot answer. For METACOM this is the normal state
     * after anything that resets a browser's per-site permissions — a new
     * address, cleared site data — because the folder grant is scoped to the
     * site, not to the app. Without this the only signal was "(nicht bereit)"
     * in grey next to the composer, while every row showed broken symbols and
     * offered nothing to click.
     */
    const sourceUnusable = sourceSettled && !sourceBusy
      && (!provider().isReady() || (providerId() === 'metacom' && unreadable >= 3));

    busyMessage.textContent = status.kind === 'loading' ? status.message : 'Einen Moment …';
    unusableMessage.textContent = providerId() === 'metacom'
      ? 'bildhaft kann deinen METACOM-Ordner gerade nicht lesen. Bestätige den Zugriff einmal — wähle dabei „Bei jedem Besuch zulassen“, dann fragt der Browser künftig nicht mehr. Deine Sätze bleiben ohnehin erhalten.'
      : 'Die aktive Symbolquelle ist gerade nicht verfügbar.';
    toggleVisible(regrant, providerId() === 'metacom');

    const wanted: [string, HTMLElement][] = [];
    if (sourceBusy) wanted.push(['busy', busyBanner]);
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

  function toggleVisible(node: HTMLElement, on: boolean): void {
    node.style.display = on ? '' : 'none';
  }

  /* ------------------------------------------------------------- toast --- */

  /*
   * The toast is a live region, and a live region has to be in the
   * accessibility tree *before* the text lands. A reader announces a change in
   * something it was already watching; it has no reason to look at an element
   * that arrives already carrying its message.
   *
   * This used to set the text, append the node, and remove it again 3.2
   * seconds later — so it re-entered the tree carrying each message and left
   * again between them, which is the one arrangement under which a live region
   * announces nothing at all. Every acknowledgement this page makes was silent:
   * a saved image, an exported Sammlung, a failed import, "Alle Daten
   * gelöscht". The words were on screen and correct the whole time, which is
   * why nothing ever looked wrong.
   *
   * So the node is mounted once, with the app, and never taken out again — see
   * render(), which is the only place root's children are set. What the timer
   * clears is the *text*. Empty it paints nothing (`.toast:empty` in app.css)
   * and it is position:fixed besides, so it costs no room either.
   *
   * mitreden and vorlaut each met this and each hold it with a spec of their
   * own; conventions.md §3.8 is the rule, and e2e/announce.spec.ts is this
   * product's copy of it.
   */
  const toast = el('div', { class: 'toast', attrs: { role: 'status' } });
  let toastTimer = 0;

  function notify(message: string): void {
    toast.textContent = message;
    window.clearTimeout(toastTimer);
    // Cleared rather than removed, which is the whole of the fix above.
    toastTimer = window.setTimeout(() => { toast.textContent = ''; }, 3200);
  }

  /* -------------------------------------------------------------- rows --- */

  const rowViews = new Map<string, { view: RowView; sentence: Sentence }>();

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
      existing?.view.destroy();
      const view = sentenceRow(sentence, providerId(), {
        onOpenSlot: (slotId) => openPicker(sentence.id, slotId),
        onAddSlot: () => void handleAddSlot(sentence.id),
        onReorder: (from, to) => void handleReorder(sentence.id, from, to),
        onUnreadableSymbol: (id) => void noteUnreadable(id),
        onPrint: () => openPrint([sentence.id]),
        onDelete: () => void confirmDeleteSentence(sentence),
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
    });

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
    });

    rowCount.textContent = `${sentences.length} Zeile${sentences.length === 1 ? '' : 'n'}`;
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
   * in it leaves the machine; test/backupFolder.test.ts holds this wiring in
   * place, and a failure there is a licensing problem rather than a bug.
   */
  const backup = new Sicherung({ app: 'bildhaft', produce: exportEverything });

  // Every write to the library, from anywhere, through the one notifier in
  // repo.ts. Debounced inside Sicherung, so a burst of edits is one file.
  onChanged(() => backup.schedule());

  /* -------------------------------------------------------------- boot --- */

  void (async () => {
    const loaded = await loadSettings();
    let all = await listCollections();

    if (all.length === 0) all = [await createCollection()];

    const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0];

    settings = loaded;
    // Before anything resolves a symbol: the preference orders search results,
    // so a slot filled in ahead of it would be filled from the wrong rendering.
    metacom.preferRendering(loaded.metacomRendering);
    collections = all;
    setActive(wanted.id);
    render();

    // Only judge the symbol source once it has had its chance to come back.
    metacom.restore().catch(() => undefined).finally(() => { sourceSettled = true; render(); });

    // Never prompts — there is no gesture here. A folder that needs its
    // permission re-confirmed lands in needs-permission and says so in
    // Einstellungen → Daten, which is where the click can happen.
    backup.restore().catch(() => undefined);
  })();

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
    activeId = id;
    if (settings && settings.lastCollectionId !== id) {
      settings = { ...settings, lastCollectionId: id };
      void saveSettings(settings);
    }
    void listSentences(id).then((loaded) => {
      if (activeId !== id) return;
      sentences = loaded;
      unreadable = 0;
      render();
    });
  }

  async function refreshCollections(): Promise<void> {
    const all = await listCollections();
    const entries = await Promise.all(
      all.map(async (c) => [c.id, await countSentences(c.id)] as const));
    collections = all;
    counts = Object.fromEntries(entries);
    sidebarView.render({
      collections, counts, activeId, searchQuery: query, searchResults: results,
    });
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

  async function handleSubmit(): Promise<void> {
    const raw = draft.trim();
    const collectionId = activeId;
    if (!raw || !settings || !collectionId || busy) return;

    const lines = splitLines(raw);
    if (lines.length === 0) return;

    busy = true;
    render();
    try {
      const options = {
        provider: provider(),
        stopwords: new Set(settings.stopwords),
        overrides: await overrideMap(providerId()),
      };

      const now = Date.now();
      const created: Sentence[] = [];

      for (const [index, line] of lines.entries()) {
        created.push({
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
        });
      }

      for (const sentence of created) await putSentence(sentence);
      sentences = [...created, ...sentences];
      draft = '';
      reuse = null;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Der Satz konnte nicht übersetzt werden.');
    } finally {
      busy = false;
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
      onOwnImage: (file) => void handleOwnImage(file),
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
          if (key.trim()) await putOverride(providerId(), key, candidate.id, candidate.label);
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
  async function handleOwnImage(file: File): Promise<void> {
    if (!picker) return;
    const { sentenceId, slotId } = picker;
    picker = null;

    await queued(async () => {
      const sentence = sentences.find((s) => s.id === sentenceId);
      const slot = sentence?.slots.find((sl) => sl.id === slotId);
      if (!sentence || !slot) return;

      try {
        const image = await putOwnImage(file);
        await updateSentence({
          ...sentence,
          slots: sentence.slots.map((sl) => (sl.id === slotId ? {
            ...sl,
            ownImage: image.id,
            // A field added by hand takes its word from the file it was given.
            sourceToken: sl.sourceToken || stemOf(file.name),
            concept: sl.concept || stemOf(file.name).toLowerCase(),
            origin: 'manual' as const,
          } : sl)),
        });
        notify('Eigenes Bild gespeichert.');
      } catch {
        notify('Das Bild konnte nicht gespeichert werden.');
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

  let previousProvider = providerId();

  async function syncProvider(): Promise<void> {
    if (previousProvider === providerId()) return;
    previousProvider = providerId();
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
    notify('Sammlung exportiert.');
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const result = await importCollectionFile(file);
      await refreshCollections();
      setActive(result.collection.id);
      notify(
        (result.collectionCount > 1 ? `${result.collectionCount} Sammlungen · ` : '')
        + `${result.sentenceCount} Zeile${result.sentenceCount === 1 ? '' : 'n'} importiert`
        + (result.overrideCount > 0 ? ` · ${result.overrideCount} Wörterbuch-Einträge` : ''),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  async function confirmDeleteSentence(sentence: Sentence): Promise<void> {
    const ok = await confirmDialog({
      title: 'Zeile löschen',
      body: `„${sentence.rawInput}“ wird entfernt.`,
      confirmLabel: 'Löschen',
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
      title: 'Sammlung löschen',
      // The confirmation names the collection and the row count, deliberately.
      body: `„${collection.name}“ und alle ${count} enthaltenen Zeilen werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: `${count} Zeile${count === 1 ? '' : 'n'} löschen`,
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

  function openAppSettings(): void {
    if (!settings) return;
    openSettings({
      settings,
      onChange: persistSettings,
      onProviderChanged: () => { void syncProvider(); render(); },
      onNotify: notify,
      onExportAll: async () => {
        downloadJson(await exportEverything(), 'sicherung');
        notify('Sicherung exportiert.');
      },
      backup,
      onImport: (file) => void handleImport(file),
      onClearAll: () => void confirmClearAll(),
      onClose: () => render(),
    });
  }

  async function confirmClearAll(): Promise<void> {
    const totals = await libraryTotals();
    const ok = await confirmDialog({
      title: 'Alle Daten löschen',
      body:
        `${totals.collections} Sammlung${totals.collections === 1 ? '' : 'en'}, `
        + `${totals.sentences} Zeile${totals.sentences === 1 ? '' : 'n'} und `
        + `${totals.overrides} Wörterbuch-Eintr${totals.overrides === 1 ? 'ag' : 'äge'} `
        + 'werden endgültig gelöscht — dazu die zwischengespeicherten Symbole und '
        + 'die Verknüpfung zu deinem METACOM-Ordner. Exportiere vorher eine '
        + 'Sicherung, wenn du die Arbeit behalten willst.',
      confirmLabel: 'Alles löschen',
      danger: true,
    });
    if (!ok) return;

    await clearEverything();
    const fresh = await createCollection();
    await refreshCollections();
    sentences = [];
    setActive(fresh.id);
    notify('Alle Daten gelöscht.');
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
  return filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Bild';
}

function mergeCandidate(candidates: Candidate[], candidate: Candidate): Candidate[] {
  if (candidates.some((c) => c.id === candidate.id)) return candidates;
  // Keep a manually searched pick in the list so it stays offered next time.
  return [candidate, ...candidates].slice(0, 8);
}
