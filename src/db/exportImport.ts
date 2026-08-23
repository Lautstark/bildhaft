import {
  BACKUP_FORMAT, BACKUP_VERSION, EXPORT_FORMAT, EXPORT_VERSION,
  type BackupExport, type Collection, type CollectionExport, type Override,
  type OwnImage, type OwnImageExport, type Sentence,
} from '../core/types.ts';
import { getDB } from './db.ts';
import {
  getOwnImage, listCollections, listOverrides, listOwnImages, listSentences, newId,
} from './repo.ts';

const NOTICE =
  'bildhaft speichert Symbol-Verweise, keine Bilddateien. Diese Datei enthält keine ' +
  'Piktogramme. Sie kann unabhängig davon geteilt werden, welche Symbolsammlung ' +
  'die Empfängerin oder der Empfänger besitzt.';

/*
 * Own pictures are the exception, and the only one. They belong to the user, so
 * a file that left them behind would be a backup that quietly loses things. No
 * ARASAAC or METACOM pixel is ever written either way — those stay references,
 * which is what makes a shared file safe whatever licence the recipient holds.
 */
const NOTICE_WITH_IMAGES = NOTICE.replace(
  'Sie kann unabhängig davon geteilt werden',
  'Enthalten sind nur deine eigenen Bilder. Sie kann unabhängig davon geteilt werden',
);

/** The bytes, inline. Nothing else about the file travels. */
async function packImages(images: OwnImage[]): Promise<OwnImageExport[]> {
  return Promise.all(images.map(async (image) => ({
    id: image.id,
    name: image.name,
    type: image.type,
    data: await toDataUrl(image.blob),
    createdAt: image.createdAt,
  })));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Bild konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
}

async function fromDataUrl(data: string): Promise<Blob> {
  const response = await fetch(data);
  return response.blob();
}

/** The own pictures these sentences actually point at, in the order they appear. */
async function imagesUsedBy(sentences: Sentence[]): Promise<OwnImage[]> {
  const ids = new Set<string>();
  for (const sentence of sentences) {
    for (const slot of sentence.slots) if (slot.ownImage) ids.add(slot.ownImage);
  }
  const found = await Promise.all([...ids].map((id) => getOwnImage(id)));
  return found.filter((image): image is OwnImage => Boolean(image));
}

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
  const images = await imagesUsedBy(sentences);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    collection: { ...collection, sentenceIds: sentences.map((s) => s.id) },
    sentences,
    overrides: includeOverrides ? await listOverrides() : undefined,
    ownImages: images.length > 0 ? await packImages(images) : undefined,
    notice: images.length > 0 ? NOTICE_WITH_IMAGES : NOTICE,
  };
}

/** Everything at once — the "make me a backup before I break something" button. */
export async function exportEverything(): Promise<BackupExport> {
  const collections = await listCollections();
  const sentences = (await Promise.all(collections.map((c) => listSentences(c.id)))).flat();
  // Every stored picture, not only the ones in use: this is the file that has
  // to be able to put the library back exactly as it was.
  const images = await listOwnImages();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    collections,
    sentences,
    overrides: await listOverrides(),
    ownImages: images.length > 0 ? await packImages(images) : undefined,
    notice: images.length > 0 ? NOTICE_WITH_IMAGES : NOTICE,
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
  ownImages?: OwnImageExport[];
}

/**
 * Restores the own pictures in a file under fresh ids, and reports which old id
 * became which. Fresh ids for the same reason everything else here gets them:
 * an import adds, and must never land on top of a picture already stored.
 */
async function restoreImages(packed: OwnImageExport[] | undefined): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  if (!packed?.length) return mapping;

  const restored: OwnImage[] = [];
  for (const image of packed) {
    if (!image?.id || typeof image.data !== 'string') continue;
    // A file is user input like any other: a picture that will not decode is
    // skipped, and the slot that wanted it falls back to its symbol.
    const blob = await fromDataUrl(image.data).catch(() => null);
    if (!blob) continue;
    const id = newId();
    mapping.set(image.id, id);
    restored.push({
      id,
      name: image.name || 'Bild',
      type: image.type || blob.type || 'image/*',
      blob,
      createdAt: image.createdAt ?? Date.now(),
    });
  }

  const db = await getDB();
  const tx = db.transaction('ownImages', 'readwrite');
  for (const image of restored) await tx.store.put(image);
  await tx.done;
  return mapping;
}

/** Points a sentence's slots at the pictures as they were just restored. */
function remapImages(sentence: Sentence, mapping: Map<string, string>): Sentence {
  if (!sentence.slots.some((slot) => slot.ownImage)) return sentence;
  return {
    ...sentence,
    slots: sentence.slots.map((slot) => (slot.ownImage
      ? { ...slot, ownImage: mapping.get(slot.ownImage) ?? null }
      : slot)),
  };
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
  const imageIds = await restoreImages(parsed.ownImages);

  const sentences: Sentence[] = parsed.sentences.map((s) => remapImages(
    { ...s, id: newId(), collectionId, createdAt: s.createdAt ?? now, updatedAt: now },
    imageIds,
  ));

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
  const imageIds = await restoreImages(parsed.ownImages);

  for (const source of parsed.sentences ?? []) {
    const target = idMap.get(source.collectionId);
    if (!target) continue; // orphaned row; drop rather than guess
    const sentence: Sentence = remapImages({
      ...source,
      id: newId(),
      collectionId: target,
      createdAt: source.createdAt ?? now,
      updatedAt: now,
    }, imageIds);
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
