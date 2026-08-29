import { clearAllProviderData } from '@lautstark/bildquelle';
import { getDB } from './db.ts';
// The seed for a user's own editable list. The list itself stays theirs and
// stays in this database; what the package supplies is where it starts.
import { GERMAN_STOPWORDS } from '@lautstark/bildquelle/german';
import { ENGLISH_STOPWORDS } from '@lautstark/bildquelle/english';
import { LANG, LOCALE, t } from '../i18n/index.ts';
import {
  DEFAULT_PRINT_SETTINGS,
  type AppSettings, type Collection, type Override, type OwnImage, type ProviderId,
  type Sentence,
} from '../core/types.ts';
import { changes } from '@lautstark/werkzeuge/changed';

const SETTINGS_KEY = 'app';

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
    sidebarOpen: false,
    metacomRendering: null,
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

export async function createCollection(name?: string): Promise<Collection> {
  const now = Date.now();
  const collection: Collection = {
    id: newId(),
    name: name?.trim() || defaultCollectionName(),
    sentenceIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDB();
  await db.put('collections', collection);
  touched();
  return collection;
}

export async function putCollection(collection: Collection): Promise<void> {
  const db = await getDB();
  await db.put('collections', { ...collection, updatedAt: Date.now() });
  touched();
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const collection = await getCollection(id);
  if (!collection) return;
  await putCollection({ ...collection, name: name.trim() || collection.name });
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
  const collection = await getCollection(id);
  if (!collection) return;
  const next = { ...collection };
  if (provider) next.provider = provider;
  else delete next.provider;
  await putCollection(next);
}

/** Deletes a collection AND its sentences. Only ever called behind a named confirm. */
export async function deleteCollectionDeep(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences'], 'readwrite');
  const sentenceIds = await tx.objectStore('sentences').index('byCollection').getAllKeys(id);
  for (const key of sentenceIds) await tx.objectStore('sentences').delete(key);
  await tx.objectStore('collections').delete(id);
  await tx.done;
  touched();
}

/* ------------------------------------------------------------ sentences --- */

export async function listSentences(collectionId: string): Promise<Sentence[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('sentences', 'byCollection', collectionId);
  return all.sort((a, b) => b.createdAt - a.createdAt); // newest on top
}

export async function putSentence(sentence: Sentence): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['sentences', 'collections'], 'readwrite');
  await tx.objectStore('sentences').put({ ...sentence, updatedAt: Date.now() });

  const collections = tx.objectStore('collections');
  const collection = await collections.get(sentence.collectionId);
  if (collection && !collection.sentenceIds.includes(sentence.id)) {
    await collections.put({
      ...collection,
      sentenceIds: [...collection.sentenceIds, sentence.id],
      updatedAt: Date.now(),
    });
  }
  await tx.done;
  touched();
}

export async function deleteSentence(id: string): Promise<void> {
  const db = await getDB();
  const sentence = await db.get('sentences', id);
  const tx = db.transaction(['sentences', 'collections'], 'readwrite');
  await tx.objectStore('sentences').delete(id);
  if (sentence) {
    const collections = tx.objectStore('collections');
    const collection = await collections.get(sentence.collectionId);
    if (collection) {
      await collections.put({
        ...collection,
        sentenceIds: collection.sentenceIds.filter((s) => s !== id),
        updatedAt: Date.now(),
      });
    }
  }
  await tx.done;
  touched();
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
    if (row.normalizedInput.includes(q) || (row.title ?? '').toLowerCase().includes(q)) {
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
  const db = await getDB();
  const stores = ['collections', 'sentences', 'overrides', 'ownImages'] as const;
  const tx = db.transaction(stores, 'readwrite');
  for (const store of stores) await tx.objectStore(store).clear();
  await tx.done;
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
const overrideKey = (provider: ProviderId, token: string) =>
  `${LANG}:${provider}:${token.toLowerCase()}`;

/** The key those rows were written under, kept only so they can still be found. */
const legacyKey = (provider: ProviderId, token: string) =>
  `${provider}:${token.toLowerCase()}`;

/** Whether an entry belongs to the language this page is in. */
const mine = (override: Override) => (override.lang ?? 'de') === LANG;

export async function putOverride(
  provider: ProviderId, token: string, symbolId: string, label: string,
): Promise<void> {
  const db = await getDB();
  await db.put('overrides', {
    key: overrideKey(provider, token),
    lang: LANG,
    provider,
    token: token.toLowerCase(),
    symbolId,
    label,
    updatedAt: Date.now(),
  });
  touched();
}

export async function deleteOverride(provider: ProviderId, token: string): Promise<void> {
  const db = await getDB();
  await db.delete('overrides', overrideKey(provider, token));
  // A German page also clears the entry as it was keyed before there was a
  // language to key it by. Deleting a key that is not there is not an error.
  if (LANG === 'de') await db.delete('overrides', legacyKey(provider, token));
  touched();
}

/** Every entry in *this* language. What the dictionary panel lists. */
export async function listOverrides(provider?: ProviderId): Promise<Override[]> {
  return (await listAllOverrides(provider)).filter(mine);
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

/** Loads this language's override table into a map — small, and consulted per token. */
export async function overrideMap(provider: ProviderId): Promise<Map<string, Override>> {
  const list = await listOverrides(provider);
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
 * Blob the page drew and has no name of its own. See ui/crop.ts.
 */
export async function putOwnImage(picture: Blob, name: string): Promise<OwnImage> {
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

export async function saveOwnImage(image: OwnImage): Promise<void> {
  const db = await getDB();
  await db.put('ownImages', image);
  touched();
}

/**
 * Drops any image no slot points at any more.
 *
 * Deleting one with its slot would be wrong: the same picture can sit in
 * several rows, and in this app a row is cheap to delete by accident.
 */
export async function pruneOwnImages(): Promise<number> {
  const db = await getDB();
  const used = new Set<string>();
  for (const sentence of await db.getAll('sentences')) {
    for (const slot of sentence.slots) if (slot.ownImage) used.add(slot.ownImage);
  }

  const tx = db.transaction('ownImages', 'readwrite');
  let removed = 0;
  for (const image of await tx.store.getAll()) {
    if (used.has(image.id)) continue;
    await tx.store.delete(image.id);
    removed++;
  }
  await tx.done;
  if (removed > 0) touched();
  return removed;
}
