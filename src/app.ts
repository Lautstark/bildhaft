import type {
  AppSettings, Candidate, Collection, PrintSettings, Sentence, Slot,
} from './core/types.ts';
import { normalizeInput, splitLines } from './core/normalize.ts';
import { buildSlots, resolveSlotsForProvider } from './core/match.ts';
import { getProvider, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { isBlockedByOtherTab, onBlockedChange } from './db/db.ts';
import {
  clearEverything, countSentences, createCollection, deleteCollectionDeep,
  deleteSentence, findByNormalized, libraryTotals, listCollections, listSentences,
  loadSettings, newId, overrideMap, putOverride, putSentence, renameCollection,
  saveSettings, searchSentences,
} from './db/repo.ts';
import {
  downloadCollectionExport, downloadJson, exportCollection, exportEverything,
  importCollectionFile,
} from './db/exportImport.ts';
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
    onImport: (file) => void handleImport(file),
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

  const titleInput = el('input', {
    class: 'title-input',
    attrs: { 'aria-label': 'Name der Sammlung', placeholder: 'Name der Sammlung' },
    on: {
      input: () => {
        const name = titleInput.value;
        if (!activeId) return;
        collections = collections.map((c) => (c.id === activeId ? { ...c, name } : c));
        scheduleRename(activeId, name);
        render();
      },
      blur: () => { if (activeId) void flushRename(activeId, titleInput.value); },
      keydown: (event) => { if (event.key === 'Enter') titleInput.blur(); },
    },
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
    actionMenu('Aktionen für diese Sammlung', () => [
      { label: 'Sammlung exportieren', onSelect: () => void handleExport(), disabled: sentences.length === 0 },
      { label: 'Sammlung löschen', onSelect: () => void confirmDeleteCollection(), danger: true },
    ]),
  );

  const rowsHost = el('div', { class: 'rows' });
  const emptyState = el('div', { class: 'empty' },
    el('b', { text: 'Noch keine Sätze' }),
    el('small', { html: 'Tippe oben einen Satz und drücke <kbd>Enter</kbd>.' }));

  const inner = el('div', { class: 'main__inner' },
    composerView.node, collectionHead, rowsHost);

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

  const busyMessage = el('span', { style: { flex: '1' } });
  const busyBanner = el('div', { class: 'banner banner--busy', attrs: { role: 'status' } },
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

    for (const node of [busyBanner, unusableBanner, blockedBanner]) node.remove();
    for (const [, node] of wanted) inner.insertBefore(node, composerView.node);
  }

  function toggleVisible(node: HTMLElement, on: boolean): void {
    node.style.display = on ? '' : 'none';
  }

  /* ------------------------------------------------------------- toast --- */

  const toast = el('div', { class: 'toast', attrs: { role: 'status' } });
  let toastTimer = 0;

  function notify(message: string): void {
    toast.textContent = message;
    if (!toast.isConnected) root.appendChild(toast);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 3200);
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
    if (!appRoot.isConnected) fill(root, appRoot, printRoot);

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
    if (titleInput.value !== (collection?.name ?? '')) titleInput.value = collection?.name ?? '';

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

  /* -------------------------------------------------------------- boot --- */

  void (async () => {
    const loaded = await loadSettings();
    let all = await listCollections();

    if (all.length === 0) all = [await createCollection()];

    const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0];

    settings = loaded;
    collections = all;
    setActive(wanted.id);
    render();

    // Only judge the symbol source once it has had its chance to come back.
    metacom.restore().catch(() => undefined).finally(() => { sourceSettled = true; render(); });
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
    settings = next;
    void saveSettings(next);
    render();
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
  let renameTimer = 0;

  function scheduleRename(id: string, name: string): void {
    window.clearTimeout(renameTimer);
    renameTimer = window.setTimeout(() => { void renameCollection(id, name); }, 400);
  }

  function flushRename(id: string, name: string): Promise<unknown> {
    window.clearTimeout(renameTimer);
    return renameCollection(id, name);
  }

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

  async function updateSentence(next: Sentence): Promise<void> {
    await putSentence(next);
    sentences = sentences.map((s) => (s.id === next.id ? next : s));
    render();
  }

  async function mutateSlots(sentenceId: string, fn: (slots: Slot[]) => Slot[]): Promise<void> {
    const sentence = sentences.find((s) => s.id === sentenceId);
    if (!sentence) return;
    await updateSentence({ ...sentence, slots: fn(sentence.slots) });
  }

  function openPicker(sentenceId: string, slotId: string): void {
    const slot = sentences.find((s) => s.id === sentenceId)?.slots.find((sl) => sl.id === slotId);
    if (!slot) return;
    picker = { sentenceId, slotId };
    openSlotPicker(slot, providerId(), {
      onChoose: (candidate) => void handleChoose(candidate),
      onRemove: () => void handleRemoveSlot(),
      onClose: () => void handleClosePicker(),
    });
  }

  async function handleChoose(candidate: Candidate): Promise<void> {
    if (!picker) return;
    const sentence = sentences.find((s) => s.id === picker!.sentenceId);
    const slot = sentence?.slots.find((sl) => sl.id === picker!.slotId);
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

    picker = null;
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

function mergeCandidate(candidates: Candidate[], candidate: Candidate): Candidate[] {
  if (candidates.some((c) => c.id === candidate.id)) return candidates;
  // Keep a manually searched pick in the list so it stays offered next time.
  return [candidate, ...candidates].slice(0, 8);
}
