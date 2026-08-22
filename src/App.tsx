import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings, Candidate, Collection, PrintSettings, Sentence, Slot,
} from './core/types.ts';
import { normalizeInput } from './core/normalize.ts';
import { buildSlots, resolveSlotsForProvider } from './core/match.ts';
import { getProvider, metacom, MetacomProvider } from '@lautstark/bildquelle';
import { isBlockedByOtherTab, onBlockedChange } from './db/db.ts';
import {
  clearEverything, countSentences, createCollection, defaultCollectionName,
  deleteCollectionDeep, deleteSentence, findByNormalized, libraryTotals,
  listCollections, listSentences, loadSettings, newId, overrideMap, putOverride,
  putSentence, renameCollection, saveSettings, searchSentences,
} from './db/repo.ts';
import {
  downloadCollectionExport, downloadJson, exportCollection, exportEverything,
  importCollectionFile,
} from './db/exportImport.ts';
import { Composer } from './ui/Composer.tsx';
import { Confirm } from './ui/Confirm.tsx';
import { Footer } from './ui/Footer.tsx';
import { Logo } from './ui/Logo.tsx';
import { Menu } from './ui/Menu.tsx';
import { PrintDialog } from './ui/PrintDialog.tsx';
import { SentenceRow } from './ui/SentenceRow.tsx';
import { SettingsDialog } from './ui/SettingsDialog.tsx';
import { Sidebar } from './ui/Sidebar.tsx';
import { SlotPicker } from './ui/SlotPicker.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { MOBILE_QUERY, useMediaQuery } from './ui/useMediaQuery.ts';

type PendingConfirm = {
  title: string; body: string; confirmLabel: string; danger?: boolean; action: () => Promise<void>;
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);

  const [draft, setDraft] = useState('');
  const [reuse, setReuse] = useState<Sentence | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Sentence[]>([]);

  const [picker, setPicker] = useState<{ sentenceId: string; slotId: string } | null>(null);
  const [printIds, setPrintIds] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [, forceRender] = useState(0);

  /*
   * Mobile navigation is deliberately NOT the persisted desktop preference.
   * Sharing one flag meant a sidebar left open on desktop loaded open on the
   * phone — and, when left closed, hid the only control that could reopen it.
   */
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const providerId = settings?.activeProvider ?? 'arasaac';
  const provider = getProvider(providerId);
  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeId) ?? null,
    [collections, activeId],
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  /* ------------------------------------------------------------- boot --- */

  const booted = useRef(false);

  useEffect(() => {
    // Boot exactly once. Without this guard a double-mount (StrictMode, or any
    // remount before the first run finishes) has both passes see an empty list
    // and each create a default collection.
    if (booted.current) return;
    booted.current = true;

    (async () => {
      const loaded = await loadSettings();
      let all = await listCollections();

      if (all.length === 0) all = [await createCollection()];

      const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0];

      setSettings(loaded);
      setCollections(all);
      setActiveId(wanted.id);

      metacom.restore().catch(() => undefined);
    })();
  }, []);

  useEffect(() => metacom.subscribe(() => forceRender((n) => n + 1)), []);

  // A stale tab holding an older database version blocks the upgrade here, which
  // would otherwise present as symbols stuck loading with no explanation.
  const [dbBlocked, setDbBlocked] = useState(false);
  useEffect(() => onBlockedChange(() => setDbBlocked(isBlockedByOtherTab())), []);

  /*
   * A METACOM folder grant is per site and per browsing session. The index is
   * cached, so the source can report itself ready while every actual file read
   * is refused — the app looks fine and every symbol is blank. Counting
   * unreadable symbols catches that, where asking the provider does not.
   */
  const [unreadable, setUnreadable] = useState(0);
  const noteUnreadable = useCallback(() => setUnreadable((n) => n + 1), []);
  useEffect(() => { setUnreadable(0); }, [providerId, activeId]);
  const sourceUnusable = !provider.isReady() || (providerId === 'metacom' && unreadable >= 3);

  const refreshCollections = useCallback(async () => {
    const all = await listCollections();
    setCollections(all);
    const entries = await Promise.all(all.map(async (c) => [c.id, await countSentences(c.id)] as const));
    setCounts(Object.fromEntries(entries));
  }, []);

  useEffect(() => { refreshCollections(); }, [refreshCollections, sentences.length]);

  useEffect(() => {
    if (!activeId) return;
    listSentences(activeId).then(setSentences);
  }, [activeId]);

  // Persist settings on every change — there is no save button anywhere in this app.
  const persistSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  useEffect(() => {
    if (settings && activeId && settings.lastCollectionId !== activeId) {
      persistSettings({ ...settings, lastCollectionId: activeId });
    }
  }, [activeId, settings, persistSettings]);

  /*
   * The collection name auto-saves like everything else. Saving only on blur would
   * lose the name if the tab is closed or reloaded while the field still has focus.
   */
  const renameTimer = useRef<number | null>(null);

  const scheduleRename = useCallback((id: string, name: string) => {
    if (renameTimer.current) window.clearTimeout(renameTimer.current);
    renameTimer.current = window.setTimeout(() => { renameCollection(id, name); }, 400);
  }, []);

  const flushRename = useCallback((id: string, name: string) => {
    if (renameTimer.current) window.clearTimeout(renameTimer.current);
    renameTimer.current = null;
    return renameCollection(id, name);
  }, []);

  /* ------------------------------------------------- reuse suggestion --- */

  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const normalized = normalizeInput(draft);
    if (!normalized) {
      setReuse(null);
      return;
    }
    const timer = setTimeout(async () => {
      const hits = await findByNormalized(normalized);
      const hit = hits.find((h) => h.slots.length > 0) ?? null;
      if (normalizeInput(draftRef.current) === normalized) setReuse(hit);
    }, 320);
    return () => clearTimeout(timer);
  }, [draft]);

  /* ------------------------------------------------------------ search --- */

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => { searchSentences(query).then(setResults); }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  /* ------------------------------------------------------------ submit --- */

  async function handleSubmit() {
    const raw = draft.trim();
    if (!raw || !settings || !activeId || busy) return;

    setBusy(true);
    try {
      const slots = await buildSlots(raw, {
        provider,
        stopwords: new Set(settings.stopwords),
        overrides: await overrideMap(providerId),
      });

      const now = Date.now();
      const sentence: Sentence = {
        id: newId(),
        normalizedInput: normalizeInput(raw),
        rawInput: raw,
        slots,
        collectionId: activeId,
        createdAt: now,
        updatedAt: now,
      };

      await putSentence(sentence);
      setSentences((current) => [sentence, ...current]);
      setDraft('');
      setReuse(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Der Satz konnte nicht übersetzt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReuse() {
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
    setSentences((current) => [sentence, ...current]);
    setDraft('');
    setReuse(null);
  }

  /* ------------------------------------------------------- row editing --- */

  const updateSentence = useCallback(async (next: Sentence) => {
    await putSentence(next);
    setSentences((current) => current.map((s) => (s.id === next.id ? next : s)));
  }, []);

  const mutateSlots = useCallback(
    async (sentenceId: string, fn: (slots: Slot[]) => Slot[]) => {
      const sentence = sentences.find((s) => s.id === sentenceId);
      if (!sentence) return;
      await updateSentence({ ...sentence, slots: fn(sentence.slots) });
    },
    [sentences, updateSentence],
  );

  async function handleChoose(candidate: Candidate) {
    if (!picker) return;
    const sentence = sentences.find((s) => s.id === picker.sentenceId);
    const slot = sentence?.slots.find((sl) => sl.id === picker.slotId);
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
      choice: { ...slot.choice, [providerId]: candidate.id },
      candidates: {
        ...slot.candidates,
        [providerId]: mergeCandidate(slot.candidates[providerId] ?? [], candidate),
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
        if (key.trim()) await putOverride(providerId, key, candidate.id, candidate.label);
      }
    }

    setPicker(null);
  }

  async function handleRemoveSlot() {
    if (!picker) return;
    await mutateSlots(picker.sentenceId, (slots) => slots.filter((sl) => sl.id !== picker.slotId));
    setPicker(null);
  }

  async function handleAddSlot(sentenceId: string) {
    const slot: Slot = {
      id: newId(),
      sourceToken: '',
      concept: '',
      origin: 'manual',
      choice: {},
      candidates: {},
    };
    await mutateSlots(sentenceId, (slots) => [...slots, slot]);
    setPicker({ sentenceId, slotId: slot.id });
  }

  async function handleReorder(sentenceId: string, from: number, to: number) {
    await mutateSlots(sentenceId, (slots) => {
      const next = [...slots];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  /** Discard a hand-added slot the user never filled. */
  async function handleClosePicker() {
    if (picker) {
      const slot = sentences
        .find((s) => s.id === picker.sentenceId)
        ?.slots.find((sl) => sl.id === picker.slotId);
      if (slot && !slot.concept) await handleRemoveSlot();
    }
    setPicker(null);
  }

  /* --------------------------------------------------- provider change --- */

  const previousProvider = useRef(providerId);

  useEffect(() => {
    if (previousProvider.current === providerId) return;
    previousProvider.current = providerId;
    if (!activeId) return;

    (async () => {
      setBusy(true);
      try {
        const overrides = await overrideMap(providerId);
        const current = await listSentences(activeId);
        const updated = await Promise.all(current.map(async (sentence) => ({
          ...sentence,
          slots: await resolveSlotsForProvider(sentence.slots, getProvider(providerId), overrides),
        })));
        for (const sentence of updated) await putSentence(sentence);
        setSentences(updated);
      } finally {
        setBusy(false);
      }
    })();
  }, [providerId, activeId]);

  /* ----------------------------------------------------------- actions --- */

  async function handleNewCollection() {
    const created = await createCollection();
    await refreshCollections();
    setActiveId(created.id);
    setSentences([]);
  }

  async function handleExport() {
    if (!activeCollection) return;
    downloadCollectionExport(await exportCollection(activeCollection));
    notify('Sammlung exportiert.');
  }

  async function handleImport(file: File) {
    try {
      const result = await importCollectionFile(file);
      await refreshCollections();
      setActiveId(result.collection.id);
      notify(
        (result.collectionCount > 1 ? `${result.collectionCount} Sammlungen · ` : '') +
        `${result.sentenceCount} Zeile${result.sentenceCount === 1 ? '' : 'n'} importiert` +
        (result.overrideCount > 0 ? ` · ${result.overrideCount} Wörterbuch-Einträge` : ''),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  const confirmDeleteCollection = useCallback(() => {
    if (!activeCollection) return;
    setConfirm({
      title: 'Sammlung löschen',
      // The confirmation names the collection and the row count, deliberately.
      body: `„${activeCollection.name}“ und alle ${sentences.length} enthaltenen Zeilen werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: `${sentences.length} Zeile${sentences.length === 1 ? '' : 'n'} löschen`,
      danger: true,
      action: async () => {
        await deleteCollectionDeep(activeCollection.id);
        const remaining = (await listCollections()).filter((c) => c.id !== activeCollection.id);
        await refreshCollections();
        if (remaining[0]) setActiveId(remaining[0].id);
        else await handleNewCollection();
      },
    });
  }, [activeCollection, sentences.length, refreshCollections]);

  const printSentences = useMemo(() => {
    if (!printIds) return [];
    const byId = new Map(sentences.map((s) => [s.id, s]));
    return printIds.map((id) => byId.get(id)).filter((s): s is Sentence => Boolean(s));
  }, [printIds, sentences]);

  const pickerSlot = useMemo(() => {
    if (!picker) return null;
    return sentences.find((s) => s.id === picker.sentenceId)
      ?.slots.find((sl) => sl.id === picker.slotId) ?? null;
  }, [picker, sentences]);

  if (!settings) {
    return <div className="empty-state"><span className="spinner" /></div>;
  }

  const sidebarOpen = isMobile ? mobileNavOpen : settings.sidebarOpen;

  const toggleSidebar = () => {
    if (isMobile) setMobileNavOpen((open) => !open);
    else persistSettings({ ...settings, sidebarOpen: !settings.sidebarOpen });
  };
  // On mobile the panel overlays the content, so acting on it should dismiss it.
  const closeNavOnMobile = () => { if (isMobile) setMobileNavOpen(false); };

  return (
    <>
      <div
        id="app-root"
        className={
          `app${sidebarOpen ? '' : ' app--collapsed'}` +
          `${isMobile && mobileNavOpen ? ' app--nav-open' : ''}`
        }
      >
        <Sidebar
          collections={collections}
          counts={counts}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setQuery(''); closeNavOnMobile(); }}
          onNew={() => { handleNewCollection(); closeNavOnMobile(); }}
          searchQuery={query}
          onSearchChange={setQuery}
          searchResults={results}
          onOpenResult={(sentence) => {
            setActiveId(sentence.collectionId);
            setQuery('');
            closeNavOnMobile();
          }}
          onOpenSettings={() => { setSettingsOpen(true); closeNavOnMobile(); }}
          onImport={handleImport}
          onCollapse={toggleSidebar}
        />

        {isMobile && mobileNavOpen && (
          <button
            type="button"
            className="scrim"
            aria-label="Menü schließen"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {!sidebarOpen && (
          <div className="rail">
            <button
              type="button"
              className="btn btn--quiet btn--icon"
              onClick={toggleSidebar}
              title="Seitenleiste einblenden"
            >
              <MenuIcon />
            </button>
            <Logo size={22} />
          </div>
        )}

        <main className="main">
          <TopBar onToggleNav={toggleSidebar} title={activeCollection?.name ?? 'bildhaft'} />

          <div className="main__inner">
            {/*
              * The active source cannot answer. For METACOM this is the normal
              * state after anything that resets a browser's per-site permissions
              * — a new address, cleared site data — because the folder grant is
              * scoped to the site, not to the app. Without this the only signal
              * was "(nicht bereit)" in grey next to the composer, while every row
              * showed broken symbols and offered nothing to click.
              */}
            {sourceUnusable && (
              <div className="banner" role="alert">
                <span style={{ flex: 1 }}>
                  {providerId === 'metacom'
                    ? 'bildhaft kann deinen METACOM-Ordner gerade nicht lesen. Browser geben den Zugriff auf einen Ordner nicht dauerhaft frei — nach dem Neuladen muss er einmal bestätigt werden. Deine Sätze bleiben erhalten.'
                    : 'Die aktive Symbolquelle ist gerade nicht verfügbar.'}
                </span>
                {providerId === 'metacom' && (
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={async () => {
                      // Both need the click: re-granting and re-picking are
                      // gated on a user gesture and cannot happen on load.
                      const ok = await metacom.requestPermission().catch(() => false);
                      if (!ok && MetacomProvider.supportsPersistentPicker) {
                        await metacom.pickDirectory().catch(() => undefined);
                      }
                      setUnreadable(0);
                      forceRender((n) => n + 1);
                    }}
                  >
                    Zugriff bestätigen
                  </button>
                )}
                <button type="button" className="btn btn--sm" onClick={() => setSettingsOpen(true)}>
                  Einstellungen
                </button>
              </div>
            )}

            {dbBlocked && (
              <div className="banner" role="alert">
                bildhaft ist noch in einem anderen Tab geöffnet und blockiert die
                Aktualisierung der Datenbank. Schließe die anderen Tabs und lade
                diese Seite neu.
              </div>
            )}

            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              busy={busy}
              reuse={reuse}
              onReuse={handleReuse}
              providerName={provider.name}
              providerReady={provider.isReady()}
            />

            <div className="collection-head">
              <input
                className="title-input"
                value={activeCollection?.name ?? ''}
                aria-label="Name der Sammlung"
                placeholder="Name der Sammlung"
                onChange={(e) => {
                  const name = e.target.value;
                  if (!activeId) return;
                  setCollections((current) =>
                    current.map((c) => (c.id === activeId ? { ...c, name } : c)));
                  scheduleRename(activeId, name);
                }}
                onBlur={(e) => { if (activeId) flushRename(activeId, e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
              <span className="small faint" style={{ whiteSpace: 'nowrap' }}>
                {sentences.length} Zeile{sentences.length === 1 ? '' : 'n'}
              </span>
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                disabled={sentences.length === 0}
                onClick={() => setPrintIds(sentences.map((s) => s.id))}
              >
                Drucken
              </button>
              <Menu
                label="Aktionen für diese Sammlung"
                items={[
                  { label: 'Sammlung exportieren', onSelect: handleExport, disabled: sentences.length === 0 },
                  { label: 'Sammlung löschen', onSelect: confirmDeleteCollection, danger: true },
                ]}
              />
            </div>

            {sentences.length === 0 ? (
              <div className="empty-state">
                <p style={{ margin: 0 }}>Tippe oben einen Satz und drücke <kbd>Enter</kbd>.</p>
              </div>
            ) : (
              <div className="rows">
                {sentences.map((sentence) => (
                  <SentenceRow
                    key={sentence.id}
                    sentence={sentence}
                    provider={providerId}
                    onOpenSlot={(slotId) => setPicker({ sentenceId: sentence.id, slotId })}
                    onAddSlot={() => handleAddSlot(sentence.id)}
                    onReorder={(from, to) => handleReorder(sentence.id, from, to)}
                    onUnreadableSymbol={noteUnreadable}
                    onPrint={() => setPrintIds([sentence.id])}
                    onDelete={() => setConfirm({
                      title: 'Zeile löschen',
                      body: `„${sentence.rawInput}“ wird entfernt.`,
                      confirmLabel: 'Löschen',
                      danger: true,
                      action: async () => {
                        await deleteSentence(sentence.id);
                        setSentences((current) => current.filter((s) => s.id !== sentence.id));
                      },
                    })}
                  />
                ))}
              </div>
            )}
          </div>

          <Footer attribution={provider.attribution} />
        </main>
      </div>

      {/* Printable DOM lives outside #app-root, which @media print hides. */}
      <div id="print-root" />

      {picker && pickerSlot && (
        <SlotPicker
          slot={pickerSlot}
          provider={providerId}
          onChoose={handleChoose}
          onRemove={handleRemoveSlot}
          onClose={handleClosePicker}
        />
      )}

      {printIds && printSentences.length > 0 && (
        <PrintDialog
          sentences={printSentences}
          collectionName={activeCollection?.name ?? 'bildhaft'}
          settings={settings.print}
          onChange={(print: PrintSettings) => persistSettings({ ...settings, print })}
          provider={providerId}
          attribution={provider.attribution}
          onClose={() => setPrintIds(null)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={persistSettings}
          collection={activeCollection}
          sentenceCount={sentences.length}
          onProviderChanged={() => forceRender((n) => n + 1)}
          onNotify={notify}
          onExportAll={async () => {
            downloadJson(await exportEverything(), 'sicherung');
            notify('Sicherung exportiert.');
          }}
          onClearAll={async () => {
            const totals = await libraryTotals();
            setSettingsOpen(false);
            setConfirm({
              title: 'Alle Daten löschen',
              body:
                `${totals.collections} Sammlung${totals.collections === 1 ? '' : 'en'}, ` +
                `${totals.sentences} Zeile${totals.sentences === 1 ? '' : 'n'} und ` +
                `${totals.overrides} Wörterbuch-Eintr${totals.overrides === 1 ? 'ag' : 'äge'} ` +
                'werden endgültig gelöscht — dazu die zwischengespeicherten Symbole und ' +
                'die Verknüpfung zu deinem METACOM-Ordner. Exportiere vorher eine ' +
                'Sicherung, wenn du die Arbeit behalten willst.',
              confirmLabel: 'Alles löschen',
              danger: true,
              action: async () => {
                await clearEverything();
                const fresh = await createCollection();
                await refreshCollections();
                setActiveId(fresh.id);
                setSentences([]);
                notify('Alle Daten gelöscht.');
              },
            });
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {confirm && (
        <Confirm
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const pending = confirm;
            setConfirm(null);
            await pending.action();
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function mergeCandidate(candidates: Candidate[], candidate: Candidate): Candidate[] {
  if (candidates.some((c) => c.id === candidate.id)) return candidates;
  // Keep a manually searched pick in the list so it stays offered next time.
  return [candidate, ...candidates].slice(0, 8);
}

function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export { defaultCollectionName };
