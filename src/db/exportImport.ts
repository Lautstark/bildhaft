import {
  BACKUP_FORMAT, BACKUP_VERSION, EXPORT_FORMAT, EXPORT_VERSION,
  type BackupExport, type Collection, type CollectionExport, type Override, type Sentence,
} from '../core/types.ts';
import { getDB } from './db.ts';
import { listCollections, listOverrides, listSentences, newId } from './repo.ts';

const NOTICE =
  'bildhaft speichert Symbol-Verweise, keine Bilddateien. Diese Datei enthält keine ' +
  'Piktogramme. Sie kann unabhängig davon geteilt werden, welche Symbolsammlung ' +
  'die Empfängerin oder der Empfänger besitzt.';

/**
 * Exports a collection as plain JSON. This is the entire backup story on a static
 * site — without it someone loses three evenings of work to a cleared cache.
 *
 * The file holds references only, never image data, which is exactly what makes
 * it shareable regardless of anyone's METACOM licence status.
 */
export async function exportCollection(
  collection: Collection, includeOverrides = true,
): Promise<CollectionExport> {
  const sentences = await listSentences(collection.id);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    collection: { ...collection, sentenceIds: sentences.map((s) => s.id) },
    sentences,
    overrides: includeOverrides ? await listOverrides() : undefined,
    notice: NOTICE,
  };
}

/** Everything at once — the "make me a backup before I break something" button. */
export async function exportEverything(): Promise<BackupExport> {
  const collections = await listCollections();
  const sentences = (await Promise.all(collections.map((c) => listSentences(c.id)))).flat();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    collections,
    sentences,
    overrides: await listOverrides(),
    notice: NOTICE,
  };
}

export function downloadJson(data: unknown, name: string): void {
  const safeName = name.replace(/[^\p{L}\p{N}\s-]/gu, '').trim() || 'export';
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bildhaft-${safeName}-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCollectionExport(data: CollectionExport): void {
  downloadJson(data, data.collection.name || 'sammlung');
}

export interface ImportResult {
  /** The collection to focus after import; the first one for a full backup. */
  collection: Collection;
  collectionCount: number;
  sentenceCount: number;
  overrideCount: number;
}

interface AnyExport {
  format?: string;
  version?: number;
  collection?: Partial<Collection>;
  /** Full-backup field. */
  collections?: Collection[];
  sentences?: Sentence[];
  overrides?: Override[];
}

/**
 * Imports a collection file. Always creates a NEW collection with fresh ids rather
 * than overwriting anything: importing must never be able to destroy existing work.
 */
export async function importCollectionFile(file: File): Promise<ImportResult> {
  const parsed = JSON.parse(await file.text()) as AnyExport;

  if (parsed?.format === BACKUP_FORMAT) return importBackup(parsed);

  if (parsed?.format !== EXPORT_FORMAT) {
    throw new Error('Das ist keine bildhaft-Datei.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > EXPORT_VERSION) {
    throw new Error('Diese Datei stammt aus einer neueren Version von bildhaft.');
  }

  const source = parsed.collection;
  if (!source || !Array.isArray(parsed.sentences)) {
    throw new Error('Die Datei ist unvollständig.');
  }

  const now = Date.now();
  const collectionId = newId();

  const sentences: Sentence[] = parsed.sentences.map((s) => {
    return { ...s, id: newId(), collectionId, createdAt: s.createdAt ?? now, updatedAt: now };
  });

  const collection: Collection = {
    id: collectionId,
    name: source.name || 'Importierte Sammlung',
    sentenceIds: sentences.map((s) => s.id),
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences', 'overrides'], 'readwrite');
  await tx.objectStore('collections').put(collection);
  for (const sentence of sentences) await tx.objectStore('sentences').put(sentence);

  // Overrides merge in only where the user has no entry of their own — an import
  // should extend the personal dictionary, never overrule it.
  let overrideCount = 0;
  const store = tx.objectStore('overrides');
  for (const override of parsed.overrides ?? []) {
    if (!override?.key) continue;
    if (await store.get(override.key)) continue;
    await store.put(override);
    overrideCount++;
  }
  await tx.done;

  return { collection, collectionCount: 1, sentenceCount: sentences.length, overrideCount };
}

/** Restores a full backup. Like a single import, it only ever adds. */
async function importBackup(parsed: AnyExport): Promise<ImportResult> {
  const sourceCollections = parsed.collections ?? [];
  if (sourceCollections.length === 0) throw new Error('Die Sicherung enthält keine Sammlungen.');

  const now = Date.now();
  // Fresh ids throughout, so restoring a backup never collides with existing work.
  const idMap = new Map(sourceCollections.map((c) => [c.id, newId()]));

  const collections: Collection[] = sourceCollections.map((c) => ({
    ...c,
    id: idMap.get(c.id)!,
    sentenceIds: [],
    createdAt: c.createdAt ?? now,
    updatedAt: now,
  }));

  const byCollection = new Map(collections.map((c) => [c.id, c]));
  const sentences: Sentence[] = [];

  for (const source of parsed.sentences ?? []) {
    const target = idMap.get(source.collectionId);
    if (!target) continue; // orphaned row; drop rather than guess
    const sentence: Sentence = {
      ...source,
      id: newId(),
      collectionId: target,
      createdAt: source.createdAt ?? now,
      updatedAt: now,
    };
    sentences.push(sentence);
    byCollection.get(target)!.sentenceIds.push(sentence.id);
  }

  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences', 'overrides'], 'readwrite');
  for (const collection of collections) await tx.objectStore('collections').put(collection);
  for (const sentence of sentences) await tx.objectStore('sentences').put(sentence);

  let overrideCount = 0;
  const store = tx.objectStore('overrides');
  for (const override of parsed.overrides ?? []) {
    if (!override?.key) continue;
    if (await store.get(override.key)) continue;
    await store.put(override);
    overrideCount++;
  }
  await tx.done;

  return {
    collection: collections[0],
    collectionCount: collections.length,
    sentenceCount: sentences.length,
    overrideCount,
  };
}
