import {
  BACKUP_FORMAT, BACKUP_VERSION, COLLECTION_KINDS, EXPORT_FORMAT, EXPORT_VERSION,
  type BackupExport, type Board, type Collection, type CollectionExport, type CollectionKind,
  OWN_PREFIX, ownImageId, ownImagesInUse,
  type GameBook, type Override, type OwnImage, type OwnImageExport, type Sentence, type Slot, type Song, type TalkBook,
} from '../core/types.ts';
import { getDB } from './db.ts';
import { t } from '../i18n/index.ts';
import {
  getOwnImage, listCollections, listAllOverrides, listOwnImages, listSentences, newId,
} from './repo.ts';
import {
  fileCollection, fileImage, fileOverride, fileSentence, isStale, isStore,
} from './folder.ts';
import { downloadJson as offer } from '@lautstark/werkzeuge/download';
import { downloadSlug } from '@lautstark/werkzeuge/filename';

const NOTICE = t('export.notice');

/*
 * Own pictures are the exception, and the only one. They belong to the user, so
 * a file that left them behind would be a backup that quietly loses things. No
 * ARASAAC or METACOM pixel is ever written either way — those stay references,
 * which is what makes a shared file safe whatever licence the recipient holds.
 */
const NOTICE_WITH_IMAGES = `${t('export.notice_images')} ${NOTICE}`;

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

/**
 * The collection as it travels to somebody else: everything about it except
 * which symbol source *this* browser draws it in.
 *
 * The notice above promises the file „kann unabhängig davon geteilt werden,
 * welche Symbolsammlung die Empfängerin oder der Empfänger besitzt", and that
 * promise is kept by the model rather than by hope — slots hold concept keys
 * and a choice per provider, so the same rows resolve in whichever source the
 * reader has. A `provider` written into the file would be the one field that
 * broke it: a collection arriving set to METACOM at somebody without a licence
 * would open on a source they cannot read. It is a preference about a view, and
 * the view is the recipient's.
 *
 * `importCollectionFile` below builds its collection field by field and would
 * drop it anyway. This is the other half, and the half that matters: what
 * leaves the machine is what the notice is about.
 *
 * A backup is the opposite case and keeps it — `exportEverything` passes
 * collections through untouched, because that file exists to put this library
 * back exactly as it was, on this machine, where the folder it names is real.
 */
function portable(collection: Collection): Collection {
  const copy = { ...collection };
  delete copy.provider;
  /* Files in this household's folder; somebody else's folder does not have them. */
  delete copy.pdfs;
  return copy;
}

/**
 * The own pictures this file points at, in the order they appear.
 *
 * The rows *and* the Wortschatz entries going with them: a sentence written
 * with a word whose entry is a photo draws it through `slot.choice`, and the
 * entry itself travels in `overrides`. `ownImagesInUse` is the same question
 * the prune asks, so a picture is in the file exactly when it is kept here.
 */
async function imagesUsedBy(
  sentences: Sentence[], overrides: readonly Override[] = [],
): Promise<OwnImage[]> {
  const ids = ownImagesInUse(sentences, overrides);
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
  const overrides = includeOverrides ? await listAllOverrides() : undefined;
  const images = await imagesUsedBy(sentences, overrides);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    collection: portable(collection),
    sentences,
    overrides,
    ownImages: images.length > 0 ? await packImages(images) : undefined,
    notice: images.length > 0 ? NOTICE_WITH_IMAGES : NOTICE,
  };
}

/**
 * Whether the picture bytes have to travel inside the file.
 *
 * They do when this browser is the only place they exist. They do not when a
 * folder is the store and reachable: the same bytes are already lying in
 * `bildhaft/bilder/`, one file per picture, beside the records that name them —
 * and putting them in as well made the standing backup an 85 MB document,
 * rebuilt and rewritten four seconds after every edit. Measured on a real
 * library: 2.4s to serialise, and the serialising happens on the thread that
 * draws. That is a copy nobody asked for, paid for on every keystroke, of
 * bytes that are already there.
 *
 * Stale counts as "not reachable", deliberately: a folder that cannot be read
 * is not a place the pictures can be got back from, so they go in the file.
 */
const picturesAreFiled = (): boolean => isStore() && !isStale();

/**
 * Everything at once — the "make me a backup before I break something" button,
 * and the standing backup, which calls it with no argument.
 *
 * `withImages` defaults to what the folder makes necessary rather than to
 * `true`, so the download somebody asks for by hand is always whole while the
 * one written after every edit stays small.
 */
export async function exportEverything(withImages = !picturesAreFiled()): Promise<BackupExport> {
  const collections = await listCollections();
  const sentences = (await Promise.all(collections.map((c) => listSentences(c.id)))).flat();
  // Every stored picture, not only the ones in use: this is the file that has
  // to be able to put the library back exactly as it was.
  const images = withImages ? await listOwnImages() : [];
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    collections,
    sentences,
    overrides: await listAllOverrides(),
    ownImages: images.length > 0 ? await packImages(images) : undefined,
    notice: images.length > 0 ? NOTICE_WITH_IMAGES : NOTICE,
  };
}

/**
 * What bildhaft calls the files it hands out: the product's name, the
 * Sammlung's, and the day.
 *
 * The trigger under it is @lautstark/werkzeuge/download, which takes a
 * filename whole — the prefix and the stamp are this product's and vorlaut
 * deliberately has neither. What this file lost with it is the bug: the copy
 * here revoked the blob URL on the line after the click, and a blob revoked
 * before the browser has opened the URL is a download that silently never
 * begins. Both other products carried a comment saying so.
 *
 * The name is now spelled rather than stripped, which is the visible half:
 * "Häufige Wörter!" was `Häufige Wörter` and is `Haeufige_Woerter_`. See
 * @lautstark/werkzeuge/filename — nothing reads a download's name back, and
 * the person it is for reads it.
 */
export function downloadJson(data: unknown, name: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  offer(data, `bildhaft-${downloadSlug(name, 'export')}-${stamp}.json`);
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
  /** Full-backup field. Older files list each Sammlung's rows as well. */
  collections?: (Collection & { sentenceIds?: unknown })[];
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
  // To the folder too, bytes beside the record, before any card points at one.
  for (const image of restored) await fileImage(image);
  return mapping;
}

/**
 * A prefixed `own:` id pointed at the picture as it was just restored.
 *
 * Anything else — a symbol id, or an own picture the file did not carry —
 * comes back as it went in. An unknown own id is not cleared the way an
 * unknown `ownImage` is: a choice is per provider and also names symbols, and
 * a file restored into the browser it came from still has that picture.
 */
function remapOwnId(
  id: string | null | undefined, mapping: Map<string, string>,
): string | null | undefined {
  if (!id?.startsWith(OWN_PREFIX)) return id;
  const fresh = mapping.get(id.slice(OWN_PREFIX.length));
  return fresh ? ownImageId(fresh) : id;
}

/**
 * Points a sentence's slots at the pictures as they were just restored.
 *
 * Both ways a slot can hold one: `ownImage`, set from the slot picker, and a
 * `choice` of `own:<id>`, which is what a word filed with a photo in the
 * Wortschatz writes into every sentence made with it. Only the first was
 * remapped, so a row drawing Oma through the Wortschatz arrived pointing at an
 * id this browser had never seen, beside her picture stored under a fresh one.
 */
function remapImages(sentence: Sentence, mapping: Map<string, string>): Sentence {
  return {
    ...sentence,
    slots: sentence.slots.map((slot) => ({
      ...slot,
      ...(slot.ownImage ? { ownImage: mapping.get(slot.ownImage) ?? null } : {}),
      choice: Object.fromEntries(Object.entries(slot.choice)
        .map(([provider, id]) => [provider, remapOwnId(id, mapping)])) as Slot['choice'],
    })),
  };
}

/** A Wortschatz entry pointed at its picture as it was just restored. */
function remapOverride(override: Override, mapping: Map<string, string>): Override {
  const symbolId = remapOwnId(override.symbolId, mapping) ?? override.symbolId;
  return symbolId === override.symbolId ? override : { ...override, symbolId };
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
    throw new Error(t('export.file_incomplete'));
  }

  const now = Date.now();
  const collectionId = newId();
  const imageIds = await restoreImages(parsed.ownImages);

  const sentenceIds = new Map<string, string>();
  const sentences: Sentence[] = parsed.sentences.map((s) => {
    const id = newId();
    sentenceIds.set(s.id, id);
    return remapImages(
      { ...s, id, collectionId, createdAt: s.createdAt ?? now, updatedAt: now },
      imageIds,
    );
  });

  const collection: Collection = {
    id: collectionId,
    name: source.name || 'Importierte Sammlung',
    /* Carried, where provider is not: which language the sentences are in is a
       fact about them, and it is what the symbol search has to be asked in for
       a correction to be findable at all. */
    ...(source.language === 'de' || source.language === 'en'
      ? { language: source.language } : {}),
    /* The template, and a Tafel's grid with it, are what the material *is*;
       a Tafel that arrived as a list of rows would be a different thing from
       what was sent. The grid names cards by id and the ids are fresh here, so
       it is carried through the same map the rows went through. */
    ...(source.kind && (COLLECTION_KINDS as readonly string[]).includes(source.kind)
      ? { kind: source.kind as CollectionKind } : {}),
    ...(source.board ? { board: remapBoard(source.board, sentenceIds) } : {}),
    // A Lied's parts name their rows by id too.
    ...(source.song ? { song: remapSong(source.song, sentenceIds) } : {}),
    // And a Plauderbuch's pages theirs.
    ...(source.talk ? { talk: remapTalk(source.talk, sentenceIds) } : {}),
    // And a Spiel's rows theirs.
    ...(source.game ? { game: remapGame(source.game, sentenceIds) } : {}),
    // How it printed is part of what it is; the copyright choice is not in it.
    ...(source.print ? { print: source.print } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences', 'overrides'], 'readwrite');
  await tx.objectStore('collections').put(collection);
  for (const sentence of sentences) await tx.objectStore('sentences').put(sentence);

  // Overrides merge in only where the user has no entry of their own — an import
  // should extend the personal dictionary, never overrule it.
  const added: Override[] = [];
  const store = tx.objectStore('overrides');
  for (const override of parsed.overrides ?? []) {
    if (!override?.key) continue;
    if (await store.get(override.key)) continue;
    const entry = remapOverride(override, imageIds);
    await store.put(entry);
    added.push(entry);
  }
  await tx.done;
  await fileImported([collection], sentences, added);

  return { collection, collectionCount: 1, sentenceCount: sentences.length, overrideCount: added.length };
}

/**
 * A copy of a material, beside the original: same template, same Mappe, same
 * print and source, under a new name. `withContent` brings every card along
 * under fresh ids, with the grid, the song's parts, the book's pages and the
 * game's rows pointing at them; without it the copy is only the look — a
 * Tafel's grid, groups and air with every field free, and none of the cards.
 *
 * The `title` stays behind either way: absent, the paper's title follows the
 * name, and a copy is about to be renamed.
 */
export async function copyCollection(
  source: Collection, name: string, withContent: boolean,
): Promise<Collection> {
  const now = Date.now();
  const id = newId();
  const sentenceIds = new Map<string, string>();
  const sentences: Sentence[] = withContent
    ? (await listSentences(source.id)).map((s) => {
      const fresh = newId();
      sentenceIds.set(s.id, fresh);
      return { ...s, id: fresh, collectionId: id, createdAt: now, updatedAt: now };
    })
    : [];

  const { title: _title, pdfs: _pdfs, board, song, talk, game, ...kept } = source;
  const collection: Collection = {
    ...kept,
    id,
    name: name.trim() || source.name,
    ...(board ? {
      board: withContent
        ? remapBoard(board, sentenceIds)
        : { ...board, cells: (board.cells ?? []).map(() => null) },
    } : {}),
    ...(withContent && song ? { song: remapSong(song, sentenceIds) } : {}),
    ...(withContent && talk ? { talk: remapTalk(talk, sentenceIds) } : {}),
    ...(withContent && game ? { game: remapGame(game, sentenceIds) } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences'], 'readwrite');
  await tx.objectStore('collections').put(collection);
  for (const sentence of sentences) await tx.objectStore('sentences').put(sentence);
  await tx.done;
  await fileImported([collection], sentences, []);
  return collection;
}

/** A board's fields pointing at the fresh ids its cards were given. */
function remapBoard(board: Board, ids: Map<string, string>): Board {
  return {
    ...board,
    cells: (board.cells ?? []).map((cell) => (cell ? ids.get(cell) ?? null : null)),
  };
}

/** A song's lines pointing at the fresh ids its rows were given. */
function remapSong(song: Song, ids: Map<string, string>): Song {
  return {
    ...song,
    parts: (song.parts ?? []).map((part) => ({
      ...part,
      lines: (part.lines ?? []).map((id) => ids.get(id)).filter((id): id is string => Boolean(id)),
    })),
  };
}

/** A Plauderbuch's pages pointing at the fresh ids their cards were given. */
function remapTalk(talk: TalkBook, ids: Map<string, string>): TalkBook {
  return {
    pages: (talk.pages ?? []).map((page) => ({
      ...page,
      question: page.question ? ids.get(page.question) ?? null : null,
      sayings: (page.sayings ?? []).map((id) => ids.get(id)).filter((id): id is string => Boolean(id)),
    })),
  };
}

/** A Spiel's rows pointing at the fresh ids their cards were given. A row
 *  from before there were cells is read as the cells it meant. */
function remapGame(game: GameBook, ids: Map<string, string>): GameBook {
  return {
    rows: (game.rows ?? []).map((row) => ({
      id: row.id,
      zellen: (row.zellen ?? [
        ...(row.fest ?? []).map((karte) => ({ karte, platz: false })),
        ...(row.karten ?? []).map((karte) => ({ karte, platz: true })),
      ])
        .map((zelle) => ({ ...zelle, karte: ids.get(zelle.karte) }))
        .filter((zelle): zelle is { karte: string; platz: boolean } => Boolean(zelle.karte)),
    })),
  };
}

/** Restores a full backup. Like a single import, it only ever adds. */
async function importBackup(parsed: AnyExport): Promise<ImportResult> {
  const sourceCollections = parsed.collections ?? [];
  if (sourceCollections.length === 0) throw new Error(t('export.backup_empty'));

  const now = Date.now();
  // Fresh ids throughout, so restoring a backup never collides with existing work.
  const idMap = new Map(sourceCollections.map((c) => [c.id, newId()]));

  /* A backup made before `sentenceIds` went still has one on every Sammlung,
     listing the old ids. It is left behind rather than carried: nothing reads
     it, and the ids in it are not the ones the rows are about to get. */
  const collections: Collection[] = sourceCollections.map(({ sentenceIds: _old, ...c }) => ({
    ...c,
    id: idMap.get(c.id)!,
    createdAt: c.createdAt ?? now,
    updatedAt: now,
  }));

  const sentences: Sentence[] = [];
  const sentenceIds = new Map<string, string>();
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
    sentenceIds.set(source.id, sentence.id);
    sentences.push(sentence);
  }
  // A Tafel's fields name their cards by id, and every id above is new.
  for (const collection of collections) {
    if (collection.board) collection.board = remapBoard(collection.board, sentenceIds);
    if (collection.song) collection.song = remapSong(collection.song, sentenceIds);
    if (collection.talk) collection.talk = remapTalk(collection.talk, sentenceIds);
    if (collection.game) collection.game = remapGame(collection.game, sentenceIds);
  }

  const db = await getDB();
  const tx = db.transaction(['collections', 'sentences', 'overrides'], 'readwrite');
  for (const collection of collections) await tx.objectStore('collections').put(collection);
  for (const sentence of sentences) await tx.objectStore('sentences').put(sentence);

  const added: Override[] = [];
  const store = tx.objectStore('overrides');
  for (const override of parsed.overrides ?? []) {
    if (!override?.key) continue;
    if (await store.get(override.key)) continue;
    const entry = remapOverride(override, imageIds);
    await store.put(entry);
    added.push(entry);
  }
  await tx.done;
  await fileImported(collections, sentences, added);

  return {
    collection: collections[0],
    collectionCount: collections.length,
    sentenceCount: sentences.length,
    overrideCount: added.length,
  };
}

/*
 * Where a folder is the store, what an import added has to reach it, or the
 * next read of the folder replaces the browser's copy and the import is gone —
 * on screen until then, and silently not after. Record by record, as an edit
 * files them: a wholesale pushKind() would also prune whatever this browser
 * does not hold, and an import is no reason to touch anything else. Cards
 * before their Sammlung, so a folder read halfway never finds a Sammlung
 * naming cards it does not have.
 */
async function fileImported(
  collections: Collection[], sentences: Sentence[], overrides: Override[],
): Promise<void> {
  for (const sentence of sentences) await fileSentence(sentence);
  for (const collection of collections) await fileCollection(collection);
  for (const override of overrides) await fileOverride(override);
}
