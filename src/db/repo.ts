import { clearAllProviderData } from '@lautstark/bildquelle';
import { getDB, type Waiting } from './db.ts';
import {
  adopt, adopted, fileCollection, fileImage, fileNameFor, fileOverride, fileSentence, isStore,
  pushKind, readImage, readKind, sawNewer, unfile, unfileOverride, type Kind,
} from './folder.ts';
import { FORMAT, holdsNewer, upgradeLibrary, type Library } from '../core/format.ts';
// The seed for a user's own editable list. The list itself stays theirs and
// stays in this database; what the package supplies is where it starts.
import { GERMAN_STOPWORDS } from '@lautstark/bildquelle/german';
import { ENGLISH_STOPWORDS } from '@lautstark/bildquelle/english';
import { LANG, LOCALE, t, type LanguageCode } from '../i18n/index.ts';
import {
  DEFAULT_PRINT_SETTINGS, ownImagesInUse, slotCaption,
  type AppSettings, type Candidate, type Collection, type CollectionKind,
  type Override, type OwnImage,
  type ProviderId,
  type Sentence,
} from '../core/types.ts';
import { changes } from '@lautstark/werkzeuge/changed';

const SETTINGS_KEY = 'app';

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------------------------------------ in flight --- */

/*
 * Which records have a write in the air.
 *
 * The screen is drawn from memory and the store is written afterwards, so for
 * as long as a write has not landed the two disagree — and anything that
 * refills memory from the store in that window puts the *older* record back.
 * That is what a moved card jumping home is; it is also a renamed Sammlung
 * losing its name, a chosen template going back to Satzstreifen, and a symbol
 * reverting a moment after it was picked. One window, four bugs.
 *
 * Counted rather than flagged: two edits to one record overlap all the time —
 * type a name, press a template — and the first to land must not clear the
 * second's claim.
 */
const writing = new Map<string, number>();

/*
 * And when each record was last written, counted in writes rather than in
 * milliseconds.
 *
 * `isWriting` alone closes only half the window. A read that *starts* before a
 * write and *answers* after it carries the record from before the edit and
 * finds nothing in flight any more — so it would be applied, and the jump is
 * back. A reader therefore takes `mark()` before it reads and asks
 * `writtenSince` afterwards, which is a question about the read, not about the
 * moment it is answered.
 *
 * One entry per record edited this session: bounded by what a person touches
 * between reloads, which is why it is not pruned.
 */
let writes = 0;
const lastWrite = new Map<string, number>();

/** Whether memory holds a newer version of this record than the store does. */
export const isWriting = (id: string): boolean => writing.has(id);

/** Where the write count stands. Take it *before* reading the store. */
export const mark = (): number => writes;

/** Whether this record was written since that mark — so a read is behind. */
export const writtenSince = (id: string, since: number): boolean =>
  (lastWrite.get(id) ?? 0) > since;

async function claim<T>(id: string, write: () => Promise<T>): Promise<T> {
  /* Counted as writing from the moment it is asked for, and only then held
     back. Both halves of that matter: a reader that asks `isWriting` in this
     tick is behind whatever this is about to write and has to be told so —
     which is what the whole block at the top of this file is about — while
     the write itself must not land inside a folder read. So the bookkeeping
     comes first and the waiting second. */
  writing.set(id, (writing.get(id) ?? 0) + 1);
  try {
    await whenSynced();
    return await write();
  } finally {
    const left = (writing.get(id) ?? 1) - 1;
    if (left > 0) writing.set(id, left);
    else writing.delete(id);
    writes += 1;
    lastWrite.set(id, writes);
  }
}

/* ------------------------------------------------------------------ sync --- */

/*
 * The time between the library being drawn and its being known to be the
 * folder's. adr/0005.
 *
 * `boot` draws what this browser holds and reaches for the folder afterwards,
 * so there is now a window in which the page shows a copy nobody has checked.
 * Two things are needed for that to be honest, and both are here rather than
 * in the page: somewhere to say that the check is running, and a guarantee
 * that nothing is written into the window.
 *
 * **One sync at a time, and every route to one comes through
 * `pullFromFolder`** — the boot, the five-minute watch, the permission click.
 * So it is announced from there and nowhere else, and no caller has to
 * remember to say so.
 *
 * **Every write into the four stores the folder replaces waits for it.** `pull`
 * empties those stores and fills them again; a write landing between the two
 * halves was a write the second half deleted. `claim` waits, `patchOverride`
 * waits, and the handful of mutators that go through neither wait at their
 * first line — `tests/unit/sync-window.test.ts` asks that of every export
 * whose name says it writes, so the one added next year is not the one that
 * slips through. `pull` itself never waits, which is what stops it waiting on
 * itself.
 */
const syncWatchers = new Set<(busy: boolean) => void>();

/** Told when a folder read starts and when it ends. For the page's sentence. */
export function onSyncing(listener: (busy: boolean) => void): () => void {
  syncWatchers.add(listener);
  return () => syncWatchers.delete(listener);
}

let sync: Promise<void> | null = null;

/**
 * Runs the one thing that replaces the library, saying so at both ends.
 *
 * The flag is set synchronously, with no await between the check above it and
 * the assignment: a write that asks `whenSynced()` after this point finds a
 * sync and waits for it.
 *
 * **What it does not do is wait for writes already under way.** It cannot: a
 * write registers itself in `writing` before it waits here (a reader asking in
 * that moment has to be told it is behind — see the note at the top of this
 * file), so a sync that waited for `writing` to empty would be waiting for the
 * writes that are waiting for it. The caller is where that is settled instead,
 * and at boot there is exactly one such write to settle: `boot` awaits the
 * Sammlung it opened before it reads the folder. adr/0005 names the window
 * that leaves.
 */
async function syncing(work: () => Promise<void>): Promise<void> {
  while (sync) await sync.catch(() => undefined);
  const tell = (busy: boolean) => { for (const watch of syncWatchers) watch(busy); };
  tell(true);
  sync = work().finally(() => { sync = null; tell(false); });
  await sync;
}

/**
 * Waits for a folder read that is replacing the library.
 *
 * A loop rather than one await: a second sync may have begun in the moment
 * between the first one ending and the write going ahead.
 */
export async function whenSynced(): Promise<void> {
  while (sync) await sync.catch(() => undefined);
}

/* ------------------------------------------------------------------ owed --- */

/*
 * What the folder has not been told yet, and how it is told. adr/0006.
 *
 * A write used to reach IndexedDB and then the file, and the caller waited for
 * both. On a share across the house one file is several round trips — opening
 * the kind's folder, the file, a swap file, writing, swapping it in — and
 * moving one card in a list of thirty wrote thirty of them, one after another,
 * while the screen stood still.
 *
 * So the debt is written first and the file afterwards: `owe` puts a row in
 * `waiting` and returns, and the delivery goes on one queue, in the order the
 * changes were made. Three things make that safe:
 *
 * - **A delivery reads the record as IndexedDB holds it now**, not as it was
 *   when it was queued. Three quick edits of one Sammlung deliver the last of
 *   them, and an edit followed by a deletion delivers the deletion. This is
 *   also what retires `freshest()`, which existed because a snapshot taken
 *   inside a transaction is old by the time the file is written — the delivery
 *   never holds a snapshot at all.
 * - **A row is paid only for what was delivered.** The delivery remembers the
 *   row's stamp before it reads anything and deletes the row only if the stamp
 *   has not moved. An edit made while a delivery was under way leaves a newer
 *   row, which its own delivery pays.
 * - **Nothing that reads or rewrites the folder runs while a delivery is on
 *   its way.** `pullFromFolder` drains the queue and then pays what is still
 *   owed before it reads, and refuses to read at all while anything is
 *   outstanding: a folder read back without our own change in it would put the
 *   version from before the edit back on screen. `mirror` and `adoptFolder`
 *   drain it too.
 *
 * And the row is the thing bildhaft did not have. A write whose file failed —
 * folder away, permission withdrawn — left no trace anywhere, and the next
 * read, which replaces the library wholesale, deleted the record that only
 * this browser had. `tests/unit/import-folder.test.ts` records what that cost
 * once: eighteen imported Spiele, of which the two that survived were the two
 * that had been edited since.
 */

/** Never the same stamp twice: two changes to one record inside a millisecond
 *  would leave a row the first delivery takes for its own and pays. */
let stamp = 0;

/** One queue, so the folder gets the changes in the order they were made. */
let outbox: Promise<void> = Promise.resolve();

/**
 * Says the folder is owed a change to this record, and sets off to deliver it.
 *
 * Returns as soon as the row is written. Where no folder is the store there is
 * nothing to owe and no row is made — which is most households, and they are
 * left exactly as they were.
 */
async function owe(kind: Kind, record: string): Promise<void> {
  if (!isStore()) return;
  const at = stamp = Math.max(Date.now(), stamp + 1);
  await (await getDB()).put('waiting', { id: `${kind}/${record}`, kind, record, at });
  outbox = outbox.then(() => deliver(kind, record)).catch(() => undefined);
}

/** Waits until every change made so far has been delivered, or is owed. */
export async function delivered(): Promise<void> {
  /* A loop, because a delivery may be queued while the last one is awaited. */
  for (let last; last !== outbox;) { last = outbox; await last; }
}

/** How many changes the folder has not had. For a page that says so. */
export const owed = async (): Promise<number> => (await getDB()).count('waiting');

/** The record as it stands now, written to the folder — or removed from it,
 *  where the record is gone. */
async function deliverTo(kind: Kind, record: string): Promise<boolean> {
  const db = await getDB();
  switch (kind) {
    case 'sammlungen': {
      const held = await db.get('collections', record);
      return held ? fileCollection(held) : unfile('sammlungen', record);
    }
    case 'saetze': {
      const held = await db.get('sentences', record);
      return held ? fileSentence(held) : unfile('saetze', record);
    }
    case 'woerterbuch': {
      const held = await db.get('overrides', record);
      return held ? fileOverride(held) : unfileOverride(record);
    }
    case 'bilder': {
      const held = await db.get('ownImages', record);
      return held ? fileImage(held) : unfile('bilder', record);
    }
  }
}

async function deliver(kind: Kind, record: string): Promise<void> {
  const row = await (await getDB()).get('waiting', `${kind}/${record}`);
  if (!row) return;
  if (await deliverTo(kind, record)) await paid(row);
}

/** Clears a row, but only if it is still the one the delivery was about. */
async function paid(row: Waiting): Promise<void> {
  const tx = (await getDB()).transaction('waiting', 'readwrite');
  if ((await tx.store.get(row.id))?.at === row.at) await tx.store.delete(row.id);
  await tx.done;
}

/**
 * Pays what is owed, oldest first, and stops at the first thing that will not
 * land.
 *
 * Stops rather than running to the end: whatever refused the first one is
 * almost always about the folder rather than about the record, and a loop that
 * went on would write the same failure forty times before saying so. What is
 * left stays owed and is tried again on the next read.
 */
async function settleUp(): Promise<void> {
  const db = await getDB();
  const rows = (await db.getAll('waiting')).sort((a, b) => a.at - b.at);
  for (const row of rows) {
    if (!(await deliverTo(row.kind, row.record))) return;
    await paid(row);
  }
}

/* ---------------------------------------------------------------- change --- */

/*
 * Every write says so here, and the standing backup listens.
 *
 * The alternative was calling schedule() from the twelve places in app.ts that
 * change something, and it is the wrong shape for a reason worth stating: the
 * thirteenth would be added a year from now by somebody who had no idea the
 * backup existed, and nothing would fail. The library would simply stop being
 * saved, quietly, which is this feature's whole failure mode.
 *
 * So the rule is one line and lives next to the writes: **a new mutator calls
 * touched()**. tests/unit/repo-notifies.test.ts asserts it for every exported
 * function whose name says it writes, so forgetting is a red test rather than
 * a silent gap.
 *
 * The Set behind it is @lautstark/werkzeuge/changed's now; three products had
 * written the same ten lines and a fourth copy of them is in ui/symbols.ts,
 * for a subject with nothing to do with backups. What stays here is the rule
 * above, which is the part that is about this repository.
 */
const changed = changes();
export const onChanged = changed.onChanged;
const touched = changed.touched;

/* ------------------------------------------------------------- settings --- */

export function defaultSettings(): AppSettings {
  return {
    activeProvider: 'arasaac',
    stopwords: { de: [...GERMAN_STOPWORDS], en: [...ENGLISH_STOPWORDS] },
    print: { ...DEFAULT_PRINT_SETTINGS },
    lastCollectionId: null,
    /* Open. It read `false` for a long time while App.svelte's own reader said
       an absent preference means open, so a fresh install and a settings record
       written before this field existed disagreed about the same page — and the
       stored default was the one that won. conventions.md §6.3 calls that a bug
       rather than a difference, and §1.3 never said otherwise. */
    sidebarOpen: true,
    metacomRendering: null,
    pinnedTags: [],
    ordner: [],
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDB();
  const stored = await db.get('settings', SETTINGS_KEY);
  // Merge so settings added in later versions get their defaults.
  if (!stored) return defaultSettings();
  const base = defaultSettings();
  /* The list used to be one array, from when there was one language, and every
   * settings record written before that holds one. It was German by
   * definition, so it becomes the German list and English starts from its own
   * defaults. Read rather than rewritten: nothing here saves until the person
   * changes something. */
  const stopwords = Array.isArray(stored.stopwords)
    ? { ...base.stopwords, de: stored.stopwords as string[] }
    : { ...base.stopwords, ...stored.stopwords };
  return {
    ...base, ...stored, stopwords,
    print: { ...DEFAULT_PRINT_SETTINGS, ...stored.print },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', settings, SETTINGS_KEY);
  touched();
}

/* ---------------------------------------------------------- collections --- */

export async function listCollections(): Promise<Collection[]> {
  const db = await getDB();
  const all = await db.getAll('collections');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCollection(id: string): Promise<Collection | undefined> {
  return (await getDB()).get('collections', id);
}

/*
 * §1.5: a new Sammlung is named for the day. The name and the date format both
 * follow the page - this used to be a German sentence around a `de-DE` date,
 * which is the name every collection an English reader made was born with, and
 * it then appeared in the sidebar, the title field, the delete confirmation and
 * the printed footer.
 */
export function defaultCollectionName(): string {
  return t('ui.new_collection_name', {
    date: new Date().toLocaleDateString(LOCALE, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }),
  });
}

export async function createCollection(
  name?: string, kind?: CollectionKind,
): Promise<Collection> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const now = Date.now();
  const collection: Collection = {
    id: newId(),
    name: name?.trim() || defaultCollectionName(),
    /* Absent stays absent for the default. A Sammlung made today and one made
       last month should be the same record when nobody chose anything, or the
       two are told apart by a field that means the same in both. */
    ...(kind && kind !== 'satzstreifen' ? { kind } : {}),
    /* Unlike the template, the language is written even when it is the page's:
       the page's can change, and what is typed into this Sammlung today does
       not change with it. See `Collection.language`. */
    language: LANG,
    createdAt: now,
    updatedAt: now,
    v: FORMAT,
  };
  const db = await getDB();
  await db.put('collections', collection);
  await owe('sammlungen', collection.id);
  touched();
  return collection;
}

/**
 * Writes the page's language onto every Sammlung that does not say one —
 * called just before the page changes language.
 *
 * Absent has always meant "the page's language", which held until the page's
 * language could move. A Sammlung made in English before Sammlungen carried a
 * language would otherwise turn German with the switch: its next line read by
 * the German pipeline, its symbols searched at the German endpoint, its sheet
 * printed under German headings. This is the last moment the absent field still
 * means what it meant when the Sammlung was made, so it is written down now.
 */
export async function rememberLanguage(lang: LanguageCode): Promise<void> {
  for (const collection of await listCollections()) {
    if (!collection.language) await patchCollection(collection.id, { language: lang });
  }
}

/** What a write changes on a Sammlung. `undefined` takes the field off. */
export type CollectionPatch = Partial<Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * Some fields of one Sammlung, read, merged and written back in one
 * transaction. Null when it is not there.
 *
 * Every edit to a Sammlung goes through here, rather than a whole record put
 * back. A Sammlung is written from five places — its name, its source, its
 * template, its grid and its print settings — and each of them used to put the
 * whole record as it held it: renaming read the store and wrote a moment
 * later, the others wrote the copy on screen. Any two of those a moment apart
 * and the second put back the field the first had just changed — a card moved
 * on the Tafel while the name was being typed went home, a source picked while
 * the print settings were saved went back to the default. A patch only says
 * what it changes, and the read it is merged over is in the same transaction
 * as the write, so there is nothing left to be stale. mitreden's
 * patchCollection, for the same reason.
 *
 * Claimed like the sentence writes, so a refill from the store cannot put the
 * record from before the edit back on screen while this is in the air.
 */
export async function patchCollection(
  id: string, patch: CollectionPatch,
): Promise<Collection | null> {
  const kept = await claim(id, async () => {
    const db = await getDB();
    const tx = db.transaction('collections', 'readwrite');
    const held = await tx.store.get(id);
    if (!held) {
      await tx.done;
      return null;
    }
    const merged: Collection = { ...held, ...patch, updatedAt: Date.now(), v: FORMAT };
    for (const field of Object.keys(patch) as (keyof CollectionPatch)[]) {
      if (patch[field] === undefined) delete (merged as Partial<Collection>)[field];
    }
    await tx.store.put(merged);
    await tx.done;
    await owe('sammlungen', merged.id);
    return merged;
  });
  if (kept) touched();
  return kept;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  // An emptied field keeps the name it had: a Sammlung has to be called something.
  if (!name.trim()) return;
  await patchCollection(id, { name: name.trim() });
}

/**
 * Which symbol source this collection is drawn in — or `null` for "follow the
 * default", which removes the field rather than storing an answer.
 *
 * Removing it matters: an absent `provider` is what makes a collection go on
 * following the setting when the setting moves, so writing the default's
 * current value in would look identical today and diverge tomorrow.
 */
export async function saveCollectionProvider(
  id: string, provider: ProviderId | null,
): Promise<void> {
  await patchCollection(id, { provider: provider ?? undefined });
}

/** Which Ordner a material lies in, or `null` for none, which takes the field off. */
export async function saveCollectionOrdner(id: string, ordner: string | null): Promise<void> {
  await patchCollection(id, { ordner: ordner?.trim() || undefined });
}

/** Deletes a collection AND its sentences. Only ever called behind a named confirm. */
export async function deleteCollectionDeep(id: string): Promise<void> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences'], 'readwrite');
  const sentenceIds = await tx.objectStore('sentences').index('byCollection').getAllKeys(id);
  for (const key of sentenceIds) await tx.objectStore('sentences').delete(key);
  await tx.objectStore('collections').delete(id);
  await tx.done;
  /* Named removals rather than a wholesale mirror: the ids that went are the
     ones just deleted, and finding them by reading the whole folder back costs
     a second per hundred sentences filed. */
  for (const key of sentenceIds) await owe('saetze', String(key));
  await owe('sammlungen', id);
  touched();
}

/* Where a folder is the store, every change has to reach it. Single records go
   through the folder as they are written; a change that happens inside one
   IndexedDB transaction is mirrored afterwards, wholesale, because a folder write
   cannot happen inside a transaction that has to stay open. */
async function mirror(...kinds: Kind[]): Promise<void> {
  /* A delivery still on its way would land in the middle of the push, which
     writes a whole kind from what the browser holds. adr/0006. */
  await delivered();
  const db = await getDB();
  for (const kind of kinds) {
    if (kind === 'sammlungen') await pushKind('sammlungen', await db.getAll('collections'));
    if (kind === 'saetze') await pushKind('saetze', await db.getAll('sentences'));
    if (kind === 'woerterbuch') {
      const rows = await db.getAll('overrides');
      await pushKind('woerterbuch', await Promise.all(
        rows.map(async (row) => ({ ...row, id: await fileNameFor(row.key) })),
      ));
    }
    if (kind === 'bilder') {
      const rows = await db.getAll('ownImages');
      await pushKind('bilder', rows.map(({ blob: _blob, ...rest }) => ({ ...rest, updatedAt: rest.createdAt })));
    }
  }
}

/* Where a folder is the store, the folder is the truth: on start it is read and
   the browser's copy is replaced wholesale. A replace needs no reconciliation and
   no tombstones — it is not a merge — which is the whole reason two-way sync is
   not being attempted.

   It only replaces a folder that has finished becoming the store. A folder
   halfway through adoption holds fewer records than the browser does, and reading
   that back is indistinguishable from "everything was deleted elsewhere". It is
   not the same thing, and guessing cost a household its calendar once. */
export async function pullFromFolder(): Promise<boolean> {
  /* Asked before the sync is announced because it is the one question that can
     be answered without touching the folder: where no folder is the store
     there is nothing to read and nothing to say. */
  if (!isStore()) return false;
  /*
   * Through `syncing`, which is the one place a folder read is announced and
   * the one thing writes wait for. adr/0005.
   *
   * An edit that has not landed used to make this return at once — "the watch
   * comes round again; boot, the other caller, has nothing in flight". Boot
   * has something in flight now: the library is drawn before this runs, and
   * opening a Sammlung resolves the slots that were never resolved for this
   * source. So the read waits for those writes instead of skipping itself,
   * because skipping would leave the copy on screen as the answer with
   * nothing coming for five minutes.
   */
  let replaced = false;
  await syncing(async () => {
    /* Inside the sync, not before it: reading the folder's mark is a file read
       like any other, and a write that arrived while it was in the air used to
       go ahead — the gate was not closed yet. Measured by
       `tests/unit/sync-window.test.ts`, which caught exactly that. */
    if (!(await adopted())) return;

    /*
     * What this browser owes the folder goes first, and this is the one place
     * it cannot be forgotten: `pull` replaces four stores with what the folder
     * holds, so a record the folder has never been told about is a record the
     * next line deletes. adr/0006.
     *
     * The deliveries already on their way are drained before the rest are
     * paid, and nothing new can join them — a write waits for this sync, so
     * the queue stays empty for as long as this runs.
     */
    await delivered();
    await settleUp();

    /* And if anything is still owed, the folder is not read at all. Whatever
       refused the delivery — out of reach, permission withdrawn — would refuse
       the read as well, or, worse, would not: a folder read back without our
       own change in it puts the version from before the edit on screen and
       then deletes the change for good. The next read tries again. */
    if (await owed() > 0) return;

    replaced = await pull();
  });
  return replaced;
}

/** The read itself: everything the folder holds, over everything this browser
 *  holds. Only ever called inside `syncing`. */
async function pull(): Promise<boolean> {
  const db = await getDB();
  const [found, rows, words, images] = await Promise.all([
    readKind<Collection>('sammlungen'),
    readKind<Sentence>('saetze'),
    readKind<Override & { id?: string }>('woerterbuch'),
    readKind<Omit<OwnImage, 'blob'>>('bilder'),
  ]);
  /* Before anything of it is kept. A folder ahead of this build is not read
     over the browser's copy, and — folder.ts — not written to either. */
  if (sawNewer() || holdsNewer({ collections: found, sentences: rows, overrides: words })) {
    newer = true;
    return false;
  }
  const { library: { collections, sentences, overrides }, changed } =
    upgradeLibrary({ collections: found, sentences: rows, overrides: words });
  /* A picture's bytes lie beside its record; one without them would render as a
     hole, so it is left out rather than restored broken. */
  const withBytes: OwnImage[] = [];
  for (const image of images) {
    const blob = await readImage(image.id);
    if (blob) withBytes.push({ ...image, blob });
  }

  const stores = ['collections', 'sentences', 'overrides', 'ownImages'] as const;
  const tx = db.transaction(stores, 'readwrite');
  for (const store of stores) await tx.objectStore(store).clear();
  await Promise.all([
    ...collections.map((item) => tx.objectStore('collections').put(item)),
    ...sentences.map((item) => tx.objectStore('sentences').put(item)),
    /* The id was only ever a filename; the store is keyed by the word. */
    ...(overrides as (Override & { id?: string })[])
      .map(({ id: _id, ...rest }) => tx.objectStore('overrides').put(rest)),
    ...withBytes.map((item) => tx.objectStore('ownImages').put(item)),
    tx.done,
  ]);
  /* What a step rewrote goes back as files, so the next device to read the
     folder finds it done. After the transaction: a folder write cannot happen
     inside one. */
  await fileUpgraded(changed);
  touched();
  return true;
}

/* ------------------------------------------------------- record format --- */

let newer = false;

/**
 * Whether what was read — folder or browser — is ahead of this build.
 *
 * It stays true once it is: nothing here can make an old build newer, and the
 * page that asks stops and offers the one thing that can, which is loading
 * the new one.
 */
export const dataIsNewer = (): boolean => newer;

async function fileUpgraded(changed: Library): Promise<void> {
  for (const sentence of changed.sentences) await fileSentence(sentence);
  for (const collection of changed.collections) await fileCollection(collection);
  for (const { id: _id, ...override } of changed.overrides as (Override & { id?: string })[]) {
    await fileOverride(override);
  }
}

/**
 * The browser's own records, brought up to this build's format.
 *
 * Where a folder is the store pullFromFolder() has already done it, on the
 * way in. This is the household without one, whose records never pass
 * through a file. Called once at start, before the first read.
 */
export async function bringRecordsUpToDate(): Promise<void> {
  if (isStore()) return;
  const db = await getDB();
  const held: Library = {
    collections: await db.getAll('collections'),
    sentences: await db.getAll('sentences'),
    overrides: await db.getAll('overrides'),
  };
  if (holdsNewer(held)) {
    newer = true;
    return;
  }
  const { changed } = upgradeLibrary(held);
  if (!changed.collections.length && !changed.sentences.length && !changed.overrides.length) return;
  const tx = db.transaction(['collections', 'sentences', 'overrides'], 'readwrite');
  await Promise.all([
    ...changed.collections.map((item) => tx.objectStore('collections').put(item)),
    ...changed.sentences.map((item) => tx.objectStore('sentences').put(item)),
    ...changed.overrides.map((item) => tx.objectStore('overrides').put(item)),
    tx.done,
  ]);
  touched();
}

/* Connecting a folder for the first time is the migration with a before and an
   after. A folder that is already a store replaces what this browser holds; one
   that is not adopts what this browser holds — written, checked, and only then
   marked. Which happened is reported rather than assumed. */
export async function adoptFolder(): Promise<'pushed' | 'pulled' | 'incomplete'> {
  /* Before a folder becomes the store, or is read as one: a change still on
     its way belongs to whichever of the two this turns out to be. adr/0006. */
  await delivered();
  if (await adopted()) { await pullFromFolder(); return 'pulled'; }
  const db = await getDB();
  const overrides = await db.getAll('overrides');
  const went = await adopt({
    sammlungen: await db.getAll('collections'),
    saetze: await db.getAll('sentences'),
    woerterbuch: await Promise.all(
      overrides.map(async (row) => ({ ...row, id: await fileNameFor(row.key) })),
    ),
    bilder: (await db.getAll('ownImages')).map(({ blob: _blob, ...rest }) => ({
      ...rest, updatedAt: rest.createdAt,
    })),
  });
  if (!went.adopted) return went.reason === 'already' ? 'pulled' : 'incomplete';
  /* The records landed; their bytes have to follow, or the folder holds a library
     of pictures that are only names. */
  for (const image of await db.getAll('ownImages')) await fileImage(image);
  return 'pushed';
}

/* ------------------------------------------------------------ sentences --- */

export async function listSentences(collectionId: string): Promise<Sentence[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('sentences', 'byCollection', collectionId);
  return all.map(withoutHoles).sort((a, b) => b.createdAt - a.createdAt); // newest on top
}

/* A row read back without the empty places a drop onto the wrong row wrote
   into it before 2026-10-20: one such hole stopped the whole Material from
   drawing. Left out on reading, and gone for good the next time the row is
   written. */
const withoutHoles = (sentence: Sentence): Sentence =>
  (sentence.slots.every(Boolean) ? sentence : { ...sentence, slots: sentence.slots.filter(Boolean) });

export async function putSentence(sentence: Sentence): Promise<void> {
  await claim(sentence.id, () => writeSentence(sentence));
  touched();
}

async function writeSentence(sentence: Sentence): Promise<void> {
  const db = await getDB();
  const kept = { ...sentence, updatedAt: Date.now(), v: FORMAT };
  const tx = db.transaction(['sentences', 'collections'], 'readwrite');
  const sentences = tx.objectStore('sentences');
  const before = await sentences.get(sentence.id);
  await sentences.put(kept);

  /* A Sammlung that gains a row is the one being worked on, and the sidebar is
     sorted by when each was last touched — so a row arriving in it stamps it,
     and an edit to a row already there does not. This used to be decided by
     whether the id was in `sentenceIds`, a list on the Sammlung that was
     written on every add and read by nothing else; the store already says
     which rows a Sammlung has, by its index. */
  let listed: Collection | null = null;
  if (before?.collectionId !== sentence.collectionId) {
    const collections = tx.objectStore('collections');
    const collection = await collections.get(sentence.collectionId);
    if (collection) {
      listed = { ...collection, updatedAt: Date.now() };
      await collections.put(listed);
    }
  }
  await tx.done;
  /* The two records that actually moved, and nothing else. This used to
     mirror() both kinds wholesale, which reads and parses every file in the
     folder to find out what differs: with 280 sentences filed that is around
     a second of disk before the row on screen is allowed to change, on every
     single edit, growing with the library. What changed is known here. */
  await owe('saetze', kept.id);
  if (listed) await owe('sammlungen', listed.id);
}

export async function deleteSentence(id: string): Promise<void> {
  await claim(id, () => removeSentence(id));
  touched();
}

async function removeSentence(id: string): Promise<void> {
  const db = await getDB();
  const sentence = await db.get('sentences', id);
  const tx = db.transaction(['sentences', 'collections'], 'readwrite');
  await tx.objectStore('sentences').delete(id);
  let shortened: Collection | null = null;
  if (sentence) {
    const collections = tx.objectStore('collections');
    const collection = await collections.get(sentence.collectionId);
    if (collection) {
      shortened = { ...collection, updatedAt: Date.now() };
      await collections.put(shortened);
    }
  }
  await tx.done;
  await owe('saetze', id);
  if (shortened) await owe('sammlungen', shortened.id);
}

/**
 * "You have translated this line before." Looks across every collection, because
 * the value of a past translation is not confined to the book it came from.
 */
export async function findByNormalized(normalized: string): Promise<Sentence[]> {
  const db = await getDB();
  const hits = await db.getAllFromIndex('sentences', 'byNormalized', normalized);
  return hits.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Flat substring search across every sentence the user has ever made.
 *
 * Both the words it was made with and the name it was given. A row typed as
 * „waschen, einseifen, abtrocknen" and called „Hände waschen" has to answer to
 * either: the name is how it is thought of now, and the typed words are what
 * would otherwise become unfindable the moment it was named.
 *
 * And the words under its symbols. A card made with „+" — a Spiel's, a
 * Tafel's, a Rezept's Zutat — was never typed: its line is empty and its word
 * lives on the field, so a search of the line alone could not find one. Not a
 * title's symbols: they say what the material's name says, and the sidebar
 * finds the name as a Material.
 *
 * The name is matched lowercased rather than through `normalizeInput`, because
 * it never went through it — it is what somebody wrote, not a lookup key, and
 * there is no second copy of it to keep in step.
 */
export async function searchSentences(query: string, limit = 60): Promise<Sentence[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = await getDB();
  const out: Sentence[] = [];
  let cursor = await db.transaction('sentences').store.index('byUpdated').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    const row = cursor.value;
    if (row.normalizedInput.includes(q) || (row.title ?? '').toLowerCase().includes(q)
      || (row.part !== 'titel' && row.slots.some((slot) => slotCaption(slot).toLowerCase().includes(q)))) {
      out.push(row);
    }
    cursor = await cursor.continue();
  }
  return out;
}

export async function countSentences(collectionId: string): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('sentences', 'byCollection', collectionId);
}

/** Counts used by the "delete everything" confirmation, so it can name what goes. */
export async function libraryTotals(): Promise<{
  collections: number; sentences: number; overrides: number;
}> {
  const db = await getDB();
  return {
    collections: await db.count('collections'),
    sentences: await db.count('sentences'),
    overrides: await db.count('overrides'),
  };
}

/**
 * Wipes everything: collections, sentences, the personal dictionary and the
 * cached symbol data. Only ever reachable behind a confirmation that spells out
 * the counts. The METACOM folder handle goes too, so nothing is left pointing at
 * the user's disk.
 */
export async function clearEverything(): Promise<void> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const db = await getDB();
  /* `waiting` goes with them, and that is not tidiness: `mirror` below tells
     the folder about every kind wholesale, so after this there is nothing left
     for a row to be about — and a row pointing at a record nobody holds any
     more would stop the next folder read from running at all (adr/0006). */
  const stores = ['collections', 'sentences', 'overrides', 'ownImages', 'waiting'] as const;
  const tx = db.transaction(stores, 'readwrite');
  for (const store of stores) await tx.objectStore(store).clear();
  await tx.done;
  await mirror('sammlungen', 'saetze', 'woerterbuch', 'bilder');
  // The cached symbols and the folder handle live in bildquelle's database now.
  await clearAllProviderData();
  touched();
}

/* ------------------------------------------------------------ overrides --- */

/*
 * The language leads, because the word does not carry it. An entry written
 * before there was a second language has no language in its key and none in
 * its row; `mine` below is what reads those as German.
 */
const overrideKey = (provider: ProviderId, token: string, lang: LanguageCode = LANG) =>
  `${lang}:${provider}:${token.toLowerCase()}`;

/** Whether an entry belongs to a language — the page's, unless a Sammlung in another one asks. */
const inLanguage = (lang: LanguageCode) => (override: Override) => (override.lang ?? 'de') === lang;

/** Whether an entry belongs to the language this page is in. */
const mine = inLanguage(LANG);

/**
 * The stored entries for a word, found the way the list finds them.
 *
 * This exists because three functions used to build `overrideKey(provider,
 * token)` and read *that* — and the list does not. It scans and filters by
 * `mine`, so it shows entries this formula cannot address: one written before
 * there was a language to key by (`arasaac:oma`, no `lang`), and any row whose
 * key was written before tokens were lowered. Captioning or tagging such an
 * entry read `undefined` and returned quietly, which is a card that ignores
 * what is typed into it; deleting one missed a spelling and left the word on
 * screen. Both were reported as bugs and both were this.
 *
 * A list rather than one record, because a word can have more than one row
 * behind it — a legacy entry and the one a later correction wrote — and the
 * person sees them as one word. Acting on all of them is the only answer that
 * matches what they are looking at.
 */
async function entriesFor(provider: ProviderId, token: string): Promise<Override[]> {
  const wanted = token.trim().toLowerCase();
  return (await listAllOverrides(provider))
    .filter((override) => mine(override) && override.token.toLowerCase() === wanted);
}

/** What a write changes on an entry. `undefined` takes the field off. */
type OverridePatch = Partial<Omit<Override, 'key' | 'updatedAt'>>;

/**
 * One entry, read, changed and written back in one transaction.
 *
 * Every write to an entry goes through here, and the reason is the
 * Wortschatz's picker: it hands over the caption and the picture a moment
 * apart and nobody awaits the first. When each writer read the entry, went
 * away, and put its own copy back, the second put was built from the record
 * before the first landed — so picking a picture just after typing a caption
 * lost the caption, or the picture, whichever lost the race, and two tag edits
 * did the same to each other. Inside one readwrite transaction the read and the
 * put cannot be split, and IndexedDB runs two such transactions on one store
 * one after the other, so the second always reads what the first wrote. This
 * is mitreden's patchPhrases, for the same bug.
 *
 * `patch` is asked with what is stored, because what some writers change is
 * worked out from it — a tag renamed among the others an entry holds. It
 * answers `null` for "nothing to write", and an entry that is not stored is
 * only ever made by a patch that knows the word, which is `putOverride`.
 * Synchronous on purpose: a transaction closes at the first await that is not
 * its own, so the patch cannot be allowed to wait on anything.
 *
 * What reaches the folder is read from the store by the delivery rather than
 * taken from what was put here: two of these can finish in either order, and
 * the folder has to end with the later one. That used to be a reason for this
 * function to re-read the entry before filing it; it is the delivery's own
 * rule now (`owe`), and one no caller can forget.
 */
async function patchOverride(
  key: string, patch: (held: Override | undefined) => OverridePatch | null,
): Promise<Override | null> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const db = await getDB();
  const tx = db.transaction('overrides', 'readwrite');
  const held = await tx.store.get(key);
  const change = patch(held);
  if (!change) {
    await tx.done;
    return null;
  }
  const merged = { ...held, ...change, key, updatedAt: Date.now(), v: FORMAT } as Override;
  for (const field of Object.keys(change) as (keyof OverridePatch)[]) {
    if (change[field] === undefined) delete (merged as Partial<Override>)[field];
  }
  await tx.store.put(merged);
  await tx.done;
  await owe('woerterbuch', key);
  return merged;
}

export async function putOverride(
  provider: ProviderId, token: string, candidate: Candidate, lang: LanguageCode = LANG,
): Promise<void> {
  /* A second correction of the same word replaces the picture and keeps the
     rest: the tags and the caption are the household's and stay on the record,
     or filing "Oma" under Familie and then picking a better picture for her
     quietly unfiles her. A patch is what says so — only the fields below move. */
  await patchOverride(overrideKey(provider, token, lang), () => ({
    lang,
    provider,
    token: token.toLowerCase(),
    symbolId: candidate.id,
    label: candidate.label,
    /* What the source says, as it says it. Absent stays absent rather than
       being written as an empty list, so an entry that predates this and one
       whose source knows nothing are the same record. */
    categories: candidate.categories?.length ? candidate.categories : undefined,
    wordClass: candidate.wordClass || undefined,
  }));
  touched();
}

/** The tags as they are kept: trimmed, the first spelling of each, none empty. */
function tagsAsKept(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const fold = tag.toLowerCase();
    if (!tag || seen.has(fold)) continue;
    seen.add(fold);
    kept.push(tag);
  }
  return kept;
}

/**
 * Files an entry under tags, or takes it out of them. The whole set at once,
 * because that is what the caller knows: it holds the row it is editing.
 *
 * Tags are deduplicated case-insensitively and the first spelling of each is
 * the one kept — see the note on `Override.tags`. An entry that has been
 * emptied of tags loses the field rather than storing `[]`, so that a record
 * written before tags existed and one cleared of them are the same record.
 *
 * A word with no entry cannot be tagged. That is not an oversight: the
 * Wortschatz is the words this household has settled, and settling one is what
 * `putOverride` does.
 */
export async function setOverrideTags(
  provider: ProviderId, token: string, tags: readonly string[],
): Promise<void> {
  const found = await entriesFor(provider, token);
  if (found.length === 0) return;

  const kept = tagsAsKept(tags);
  for (const { key } of found) {
    await patchOverride(key, (held) => (held ? { tags: kept.length ? kept : undefined } : null));
  }
  touched();
}

/**
 * Renames a tag wherever it is written, in this language.
 *
 * A tag is a string on each entry rather than a record of its own, so renaming
 * one is a write to every entry carrying it — which is the price of tags being
 * lenses instead of folders, and it is paid here rather than by the caller.
 * Case-insensitive on the way in, so renaming „kita" also catches the entry
 * that spelled it „Kita"; the new spelling is written as given.
 *
 * Each entry's new tags are worked out from the entry as it is stored at the
 * moment of the write, not from the list read to find them, so a tag added to
 * one of them in between is renamed along with the rest instead of undone.
 *
 * Returns how many entries moved, so a caller can say nothing happened.
 */
export async function renameTag(from: string, to: string): Promise<number> {
  const before = from.trim().toLowerCase();
  const after = to.trim();
  if (!before || !after || before === after.toLowerCase()) return 0;

  let moved = 0;
  for (const { key } of await listOverrides()) {
    const wrote = await patchOverride(key, (held) => {
      if (!held?.tags?.some((tag) => tag.toLowerCase() === before)) return null;
      return { tags: tagsAsKept(held.tags.map((tag) => (tag.toLowerCase() === before ? after : tag))) };
    });
    if (wrote) moved += 1;
  }
  if (moved > 0) touched();
  return moved;
}

/**
 * Takes a tag off every entry that carries it.
 *
 * The words stay. Deleting a lens is not deleting what it was pointed at, and
 * a tag that took its words with it would be the folder this deliberately is
 * not — see adr/0002.
 */
export async function dropTag(tag: string): Promise<void> {
  const gone = tag.trim().toLowerCase();
  if (!gone) return;

  let touchedAny = false;
  for (const { key } of await listOverrides()) {
    const wrote = await patchOverride(key, (held) => {
      if (!held?.tags?.some((one) => one.toLowerCase() === gone)) return null;
      const tags = held.tags.filter((one) => one.toLowerCase() !== gone);
      return { tags: tags.length ? tags : undefined };
    });
    if (wrote) touchedAny = true;
  }
  if (touchedAny) touched();
}

/**
 * Sets the words under the symbol, or takes them off again.
 *
 * Empty removes the field rather than storing `''`, so an entry that never had
 * a caption and one whose caption was cleared are the same record — and both
 * mean "the word itself", which is what `slotCaption` falls back to.
 */
export async function setOverrideCaption(
  provider: ProviderId, token: string, caption: string,
): Promise<void> {
  const text = caption.trim();
  let wrote = false;

  for (const { key } of await entriesFor(provider, token)) {
    const done = await patchOverride(key, (held) => (
      !held || (held.caption ?? '') === text ? null : { caption: text || undefined }
    ));
    if (done) wrote = true;
  }
  if (wrote) touched();
}

export async function deleteOverride(provider: ProviderId, token: string): Promise<void> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const db = await getDB();
  /* Every row the word has, by its own key rather than by a rebuilt one. The
     two constructed keys this used to delete covered the two spellings we knew
     about; a word is gone when the entries the list would show for it are, and
     that is a thing to look up rather than to predict. */
  for (const held of await entriesFor(provider, token)) {
    await db.delete('overrides', held.key);
    await owe('woerterbuch', held.key);
  }
  touched();
}

/**
 * Every entry in *this* language — what the dictionary panel lists — or in the
 * one a Sammlung is written in, for the lines typed into it.
 */
export async function listOverrides(provider?: ProviderId, lang: LanguageCode = LANG): Promise<Override[]> {
  return (await listAllOverrides(provider)).filter(inLanguage(lang));
}

/**
 * Every entry in every language, for a backup.
 *
 * An export is the whole of what somebody has, and dropping the half they were
 * not looking at when they pressed the button would be a quiet way to lose it.
 */
export async function listAllOverrides(provider?: ProviderId): Promise<Override[]> {
  const db = await getDB();
  const all = provider
    ? await db.getAllFromIndex('overrides', 'byProvider', provider)
    : await db.getAll('overrides');
  return all.sort((a, b) => a.token.localeCompare(b.token, LANG));
}

/** Loads one language's override table into a map — small, and consulted per token. */
export async function overrideMap(provider: ProviderId, lang: LanguageCode = LANG): Promise<Map<string, Override>> {
  const list = await listOverrides(provider, lang);
  return new Map(list.map((o) => [o.token, o]));
}

/* ----------------------------------------------------------- own images --- */

/**
 * Pictures the user supplied. Stored whole, not referenced: the point of these
 * is that they keep working when the original file is moved or deleted, which
 * is exactly what a symbol folder cannot promise.
 */
/**
 * A picture of the user's own, kept.
 *
 * The name arrives beside the bytes rather than on them, because what is stored
 * is no longer always the file that was chosen: a picture cut to a square is a
 * Blob the page drew and has no name of its own. See @lautstark/design/crop.
 */
export async function putOwnImage(picture: Blob, name: string): Promise<OwnImage> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const image: OwnImage = {
    id: newId(),
    name,
    type: picture.type || 'image/*',
    // The bytes, detached from the file they came from.
    blob: new Blob([await picture.arrayBuffer()], { type: picture.type || 'image/*' }),
    createdAt: Date.now(),
  };
  const db = await getDB();
  await db.put('ownImages', image);
  await owe('bilder', image.id);
  touched();
  return image;
}

export async function getOwnImage(id: string): Promise<OwnImage | undefined> {
  const db = await getDB();
  return db.get('ownImages', id);
}

export async function listOwnImages(): Promise<OwnImage[]> {
  const db = await getDB();
  return (await db.getAll('ownImages')).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Drops any image nothing points at any more — no row and no Wortschatz entry.
 *
 * Deleting one with its slot would be wrong: the same picture can sit in
 * several rows, and in this app a row is cheap to delete by accident. What
 * counts as pointing is `ownImagesInUse`'s, which the export asks too.
 *
 * The reads and the deletes are one transaction, so a picture filed in the
 * Wortschatz or put on a row while this runs is either seen as used or was
 * not there to delete.
 */
export async function pruneOwnImages(): Promise<number> {
  // Not inside a folder read — see `syncing`.
  await whenSynced();
  const db = await getDB();
  const tx = db.transaction(['sentences', 'overrides', 'ownImages'], 'readwrite');
  const used = ownImagesInUse(
    await tx.objectStore('sentences').getAll(),
    await tx.objectStore('overrides').getAll(),
  );

  const images = tx.objectStore('ownImages');
  let removed = 0;
  for (const image of await images.getAll()) {
    if (used.has(image.id)) continue;
    await images.delete(image.id);
    removed++;
  }
  await tx.done;
  if (removed > 0) { await mirror('bilder'); touched(); }
  return removed;
}
