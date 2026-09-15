import type { ProviderId } from '../core/types.ts';
import { getProvider, setSymbolLanguage } from '@lautstark/bildquelle';
import { wanted } from '@lautstark/werkzeuge/sammlung';
import { resolveSlotsForProvider } from '../core/match.ts';
import { withTimeout } from '../core/timeout.ts';
import {
  clearEverything, countSentences, createCollection, deleteCollectionDeep,
  libraryTotals, listCollections, listOverrides, listSentences, overrideMap,
  putSentence, saveCollectionProvider, saveSettings, searchSentences,
} from '../db/repo.ts';
import { downloadCollectionExport, exportCollection, importCollectionFile } from '../db/exportImport.ts';
import { folderName, wipeReaches } from '../db/folder.ts';
import { LANG, t } from '../i18n/index.ts';
import { el } from '../ui/dom.ts';
import { confirmDialog, openDialog } from '../ui/dialog.ts';
import { openCollectionSource } from '../ui/collectionSource.ts';
import { activeCollection, providerId } from './state.ts';
import type { Ctx } from './context.ts';
import { LOOKUP_MS, STORE_MS, sayWhy } from './waiting.ts';

type Collections = Pick<Ctx,
  'setActive' | 'refreshCollections' | 'handleNewCollection' | 'handleExport'
  | 'handleImport' | 'confirmDeleteCollection' | 'openSourceSheet' | 'syncProvider'
  | 'resolveOpen' | 'confirmClearAll' | 'scheduleSearch'> & {
  /** A Sammlung the address names; see the function. Never rejects. */
  openNamed(here?: string): Promise<void>;
};

/** Which Sammlung is open, what the sidebar lists, and what happens to a whole one. */
export function collections(ctx: Ctx): Collections {
  const { s } = ctx;

  function setActive(id: string): void {
    /* Nothing from the last one stays on screen.
     *
     * The rows below are replaced when listSentences() answers, which for a
     * local read is a frame — except where what follows is long, and after an
     * import it is: the symbols of a Sammlung that has just arrived all have to
     * be resolved. Until then the head carried the new name over the previous
     * Sammlung's rows, which does not read as "loading", it reads as those rows
     * being what this Sammlung contains. */
    if (s.activeId !== id) s.sentences = [];
    s.activeId = id;
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
    setSymbolLanguage(s.collections.find((c) => c.id === id)?.language ?? LANG);
    if (s.settings && s.settings.lastCollectionId !== id) {
      s.settings = { ...s.settings, lastCollectionId: id };
      void saveSettings(s.settings);
    }
    void listSentences(id).then((loaded) => {
      if (s.activeId !== id) return;
      s.sentences = loaded;
      s.unreadable = 0;
      ctx.render();
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
    s.collections = all;
    s.counts = Object.fromEntries(entries);

    /* The Wortschatz counts come from the same pass, because they change for
       the same reasons: a correction in a Sammlung files a word, and the row
       above the Sammlungen has to say so without anybody opening it. */
    const words = await listOverrides();
    s.wordCount = words.length;
    const held = new Map<string, number>();
    for (const word of words) {
      for (const tag of word.tags ?? []) {
        held.set(tag.toLowerCase(), (held.get(tag.toLowerCase()) ?? 0) + 1);
      }
    }
    s.tagRows = (s.settings?.pinnedTags ?? [])
      .map((name) => ({ name, count: held.get(name.toLowerCase()) ?? 0 }));

    ctx.paintSidebar();
  }

  let searchTimer = 0;

  function scheduleSearch(): void {
    window.clearTimeout(searchTimer);
    if (!s.query.trim()) {
      s.results = [];
      return;
    }
    searchTimer = window.setTimeout(() => {
      void searchSentences(s.query).then((hits) => { s.results = hits; ctx.render(); });
    }, 200);
  }

  /* ---------------------------------------------------- provider change --- */

  async function syncProvider(): Promise<void> {
    if (s.previousProvider === providerId(s)) return;
    s.previousProvider = providerId(s);
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
    const id = s.activeId;
    if (!id) return;

    /* Not `busy`. This runs every time a Sammlung is opened, and it used to
       take the button while it ran — twenty-five rows checked and written
       back before a word could be typed, and forever when one write did not
       answer. It is housekeeping: it goes on in the background, and a row it
       has not reached yet draws as it was. */
    try {
      const overrides = await overrideMap(providerId(s));
      const current = await listSentences(id);
      const updated = await Promise.all(current.map(async (sentence) => ({
        ...sentence,
        slots: await withTimeout(
          resolveSlotsForProvider(sentence.slots, getProvider(providerId(s)), overrides),
          LOOKUP_MS, t('ui.wait_source')),
      })));
      // Only what actually changed is written back; the rest was already right.
      for (const [i, sentence] of updated.entries()) {
        if (sentence.slots !== current[i]!.slots) await withTimeout(putSentence(sentence), STORE_MS, t('ui.wait_store'));
      }
      if (s.activeId === id) { s.sentences = updated; ctx.render(); }
    } catch (err) {
      ctx.notify(sayWhy(err));
    }
  }

  /* ------------------------------------------------------------ actions --- */

  async function handleNewCollection(): Promise<void> {
    const created = await createCollection();
    await refreshCollections();
    s.sentences = [];
    setActive(created.id);
    ctx.render();
    // After render(), which is what puts the new name in the field. head.ts
    // says why the order matters.
    ctx.views.focusName();
  }

  async function handleExport(): Promise<void> {
    const collection = activeCollection(s);
    if (!collection) return;
    downloadCollectionExport(await exportCollection(collection));
    ctx.notify(t('ui.collection_exported'));
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
        ctx.notify(t('ui.shelf_unknown'));
        return;
      case 'offline':
        ctx.notify(t('ui.shelf_offline', { error: asked.error.message }));
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
      ctx.notify([
        result.collectionCount > 1
          ? t('ui.n_collections', { n: result.collectionCount }) : null,
        result.sentenceCount === 1
          ? t('ui.import_done_one') : t('ui.import_done', { n: result.sentenceCount }),
        result.overrideCount > 0
          ? t('ui.n_overrides', { n: result.overrideCount }) : null,
      ].filter(Boolean).join(' · '));
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : t('ui.file_unreadable'));
    }
  }

  async function confirmDeleteCollection(): Promise<void> {
    const collection = activeCollection(s);
    if (!collection) return;
    const count = s.sentences.length;
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
    if (remaining[0]) { s.sentences = []; setActive(remaining[0].id); ctx.render(); }
    else await handleNewCollection();
  }

  /**
   * The Sammlung's own sheet. Nothing is confirmed and nothing is saved on the
   * way out: each press is written through, the rows behind are re-resolved
   * against the new source, and the page says what just happened to them.
   */
  function openSourceSheet(): void {
    const collection = activeCollection(s);
    if (!collection || !s.settings) return;
    openCollectionSource({
      collection,
      rowCount: s.sentences.length,
      fallback: s.settings.activeProvider,
      onPick: (choice) => handlePickSource(collection.id, choice),
    });
  }

  async function handlePickSource(id: string, choice: ProviderId | null): Promise<void> {
    await saveCollectionProvider(id, choice);
    /* Read back rather than patched in place: `provider` is absent for "follow
       the default", and an object carrying `provider: undefined` is a different
       thing from one without the key when it is written out again. */
    await refreshCollections();
    if (s.activeId !== id) { ctx.render(); return; }

    ctx.render();
    // The same re-resolution a change of default runs, for the same reason: a
    // slot that has never been resolved against this source has no symbol under
    // it, and would draw as an empty field rather than as a picture.
    await syncProvider();

    const named = getProvider(providerId(s)).name;
    ctx.notify(choice === null
      ? t('ui.collection_follows_default', { name: collectionName(id), source: named })
      : t('ui.collection_uses_source', { name: collectionName(id), source: named }));
  }

  const collectionName = (id: string) =>
    s.collections.find((c) => c.id === id)?.name ?? t('ui.collection');

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
    s.sentences = [];
    setActive(fresh.id);
    ctx.notify(t('ui.all_data_deleted'));
    ctx.render();
  }

  return {
    setActive, refreshCollections, scheduleSearch, syncProvider, resolveOpen,
    handleNewCollection, handleExport, openNamed, handleImport,
    confirmDeleteCollection, openSourceSheet, confirmClearAll,
  };
}
