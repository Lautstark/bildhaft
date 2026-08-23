import { clearAllProviderData } from '@lautstark/bildquelle';
import { getDB } from './db.ts';
// The seed for a user's own editable list. The list itself stays theirs and
// stays in this database; what the package supplies is where it starts.
import { GERMAN_STOPWORDS } from '@lautstark/bildquelle/german';
import {
  DEFAULT_PRINT_SETTINGS,
  type AppSettings, type Collection, type Override, type OwnImage, type ProviderId,
  type Sentence,
} from '../core/types.ts';

const SETTINGS_KEY = 'app';

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------------------------------------- settings --- */

export function defaultSettings(): AppSettings {
  return {
    activeProvider: 'arasaac',
    stopwords: [...GERMAN_STOPWORDS],
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
  return stored
    ? { ...defaultSettings(), ...stored, print: { ...DEFAULT_PRINT_SETTINGS, ...stored.print } }
    : defaultSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', settings, SETTINGS_KEY);
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

export function defaultCollectionName(): string {
  return `Sammlung vom ${new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })}`;
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
  return collection;
}

export async function putCollection(collection: Collection): Promise<void> {
  const db = await getDB();
  await db.put('collections', { ...collection, updatedAt: Date.now() });
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const collection = await getCollection(id);
  if (!collection) return;
  await putCollection({ ...collection, name: name.trim() || collection.name });
}

/** Deletes a collection AND its sentences. Only ever called behind a named confirm. */
export async function deleteCollectionDeep(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences'], 'readwrite');
  const sentenceIds = await tx.objectStore('sentences').index('byCollection').getAllKeys(id);
  for (const key of sentenceIds) await tx.objectStore('sentences').delete(key);
  await tx.objectStore('collections').delete(id);
  await tx.done;
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

/** Flat substring search across every sentence the user has ever made. */
export async function searchSentences(query: string, limit = 60): Promise<Sentence[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = await getDB();
  const out: Sentence[] = [];
  let cursor = await db.transaction('sentences').store.index('byUpdated').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    if (cursor.value.normalizedInput.includes(q)) out.push(cursor.value);
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
}

/* ------------------------------------------------------------ overrides --- */

const overrideKey = (provider: ProviderId, token: string) => `${provider}:${token.toLowerCase()}`;

export async function putOverride(
  provider: ProviderId, token: string, symbolId: string, label: string,
): Promise<void> {
  const db = await getDB();
  await db.put('overrides', {
    key: overrideKey(provider, token),
    provider,
    token: token.toLowerCase(),
    symbolId,
    label,
    updatedAt: Date.now(),
  });
}

export async function deleteOverride(provider: ProviderId, token: string): Promise<void> {
  const db = await getDB();
  await db.delete('overrides', overrideKey(provider, token));
}

export async function listOverrides(provider?: ProviderId): Promise<Override[]> {
  const db = await getDB();
  const all = provider
    ? await db.getAllFromIndex('overrides', 'byProvider', provider)
    : await db.getAll('overrides');
  return all.sort((a, b) => a.token.localeCompare(b.token, 'de'));
}

/** Loads the whole override table into a map — small, and consulted per token. */
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
export async function putOwnImage(file: File): Promise<OwnImage> {
  const image: OwnImage = {
    id: newId(),
    name: file.name,
    type: file.type || 'image/*',
    // The bytes, detached from the file they came from.
    blob: new Blob([await file.arrayBuffer()], { type: file.type || 'image/*' }),
    createdAt: Date.now(),
  };
  const db = await getDB();
  await db.put('ownImages', image);
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
  return removed;
}
