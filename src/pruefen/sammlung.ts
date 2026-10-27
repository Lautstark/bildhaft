/**
 * Her own materials on the Prüfseite, read the way the app reads its Ablage:
 * from the folder she picks — `Lautstark`, which holds both `bildhaft/` (the
 * Sammlungen and their rows as JSON) and her METACOM library. Nothing of it
 * is copied anywhere: the pictures become object URLs in this tab, the
 * records stay records, and the folder's handle is kept in this browser so a
 * reload asks only to be let in again.
 */
import { openDB } from 'idb';
import { getProvider } from '@lautstark/bildquelle';
import type { Collection, CollectionKind, ProviderId, Sentence } from '../core/types.ts';
import { contentOf, kindOf, OWN_PREFIX, symbolIdFor, titleOf, titlePictures } from '../core/types.ts';
import { boardOf, placedIds, stylesOf, zonesOf } from '../core/board.ts';
import { sungParts } from '../core/song.ts';
import { rowsOfGame } from '../core/game.ts';
import { primeSymbolUrl } from '../ui/symbols.ts';
import type { Material } from './faelle.ts';

const store = () => openDB('bildhaft-pruefen', 1, { upgrade: (db) => db.createObjectStore('ordner') });

/** The folder picked last time, if this browser still has it. */
export async function gemerkterOrdner(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await (await store()).get('ordner', 'lautstark')) ?? null;
  } catch {
    return null;
  }
}

/** Asks for the folder, or to be let into the one kept — either needs a click. */
export async function ordnerOeffnen(kept: FileSystemDirectoryHandle | null): Promise<FileSystemDirectoryHandle> {
  if (kept) {
    const asked = kept as FileSystemDirectoryHandle & { requestPermission(o: { mode: 'read' }): Promise<PermissionState> };
    if (await asked.requestPermission({ mode: 'read' }) === 'granted') return kept;
  }
  const picked = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker({ id: 'lautstark', mode: 'read' });
  await (await store()).put('ordner', picked, 'lautstark');
  return picked;
}

async function dir(root: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemDirectoryHandle | null> {
  let at = root;
  for (const name of path) {
    try {
      at = await at.getDirectoryHandle(name);
    } catch {
      return null;
    }
  }
  return at;
}

async function jsonsIn(folder: FileSystemDirectoryHandle | null): Promise<unknown[]> {
  if (!folder) return [];
  const out: Promise<unknown>[] = [];
  for await (const [name, handle] of (folder as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      out.push((handle as FileSystemFileHandle).getFile().then((file) => file.text()).then(JSON.parse).catch(() => null));
    }
  }
  return (await Promise.all(out)).filter(Boolean);
}

/**
 * Her material as the print takes it — the same reading of a Sammlung the
 * app's own print does (app/print.ts, buildOptions): a Tafel's placed cards
 * in its grid, a Lied as it is sung, a Plauderbuch page by page, a Spiel row
 * by row, a Rezept oldest first.
 */
function materialAus(c: Collection, all: Sentence[], provider: ProviderId): Material {
  const which = kindOf(c);
  const byId = new Map(all.map((sentence) => [sentence.id, sentence]));
  const get = (id: string) => byId.get(id);
  const some = <T,>(x: T | undefined): x is T => Boolean(x);
  const board = which === 'tafel' ? boardOf(c) : null;
  const song = which === 'lied' && c.song ? {
    parts: sungParts(c.song).map((at) => ({ kind: at.kind, n: at.n, first: at.first, lines: at.part.lines.map(get).filter(some) })),
  } : undefined;
  const talk = which === 'plauderbuch' && c.talk ? {
    pages: c.talk.pages.map((page) => ({ question: page.question ? get(page.question) ?? null : null, sayings: page.sayings.map(get).filter(some) })),
  } : undefined;
  const game = which === 'spiel' && c.game ? {
    rows: rowsOfGame(c.game).map((row) => ({
      zellen: row.zellen.map((z) => ({ karte: get(z.karte), platz: z.platz })).filter((z): z is { karte: Sentence; platz: boolean } => Boolean(z.karte)),
    })),
  } : undefined;
  const sentences = board ? placedIds(board).map(get).filter(some)
    : which === 'rezept' ? [...all].sort((a, b) => a.createdAt - b.createdAt)
    : contentOf(all);
  return {
    id: c.id, quelle: c.name, name: titleOf(c), provider, sentences, pictures: titlePictures(all),
    board: board ? { cols: board.cols, rows: board.rows, zones: zonesOf(board), styles: stylesOf(board), cells: board.cells.map((id) => (id ? get(id) ?? null : null)) } : undefined,
    song, talk, game,
  };
}

/** Her materials by template, every picture they need already known to the sheet. */
export async function sammlungLesen(root: FileSystemDirectoryHandle): Promise<Map<CollectionKind, Material[]>> {
  const app = await dir(root, ['bildhaft']) ?? root;
  const collections = (await jsonsIn(await dir(app, ['sammlungen']))) as Collection[];
  const rows = (await jsonsIn(await dir(app, ['saetze']))) as Sentence[];
  const bilder = await dir(app, ['bilder']);
  const metacom = await dir(root, ['METACOM_9_Desktop']);

  const byCollection = new Map<string, Sentence[]>();
  for (const row of rows) byCollection.set(row.collectionId, [...(byCollection.get(row.collectionId) ?? []), row]);

  const out = new Map<CollectionKind, Material[]>();
  const wanted = new Map<string, { provider: ProviderId; id: string }>();
  for (const c of collections.sort((a, b) => b.updatedAt - a.updatedAt)) {
    const all = byCollection.get(c.id) ?? [];
    /* No source of its own: the one its cards were chosen in. */
    const slots = all.flatMap((sentence) => sentence.slots);
    const provider: ProviderId = c.provider ?? (slots.some((slot) => slot.choice.metacom) ? 'metacom' : 'arasaac');
    const m = materialAus(c, all, provider);
    out.set(kindOf(c), [...(out.get(kindOf(c)) ?? []), m]);
    for (const slot of slots) {
      const id = symbolIdFor(slot, provider);
      if (id) wanted.set(`${provider}:${id}`, { provider, id });
    }
  }

  await Promise.all([...wanted.values()].map(async ({ provider, id }) => {
    const url = await bildUrl(provider, id, metacom, bilder);
    if (url) primeSymbolUrl(provider, id, url);
  }));
  return out;
}

async function datei(folder: FileSystemDirectoryHandle | null, path: string): Promise<File | null> {
  if (!folder) return null;
  const parts = path.split('/').filter(Boolean);
  const at = await dir(folder, parts.slice(0, -1));
  try {
    return at ? await (await at.getFileHandle(parts.at(-1)!)).getFile() : null;
  } catch {
    return null;
  }
}

async function bildUrl(provider: ProviderId, id: string, metacom: FileSystemDirectoryHandle | null, bilder: FileSystemDirectoryHandle | null): Promise<string | null> {
  if (id.startsWith(OWN_PREFIX)) {
    const own = id.slice(OWN_PREFIX.length);
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
      const file = await datei(bilder, `${own}.${ext}`);
      if (file) return URL.createObjectURL(file);
    }
    return null;
  }
  if (provider === 'metacom') {
    const file = await datei(metacom, id);
    return file ? URL.createObjectURL(file) : null;
  }
  return getProvider(provider).getImageUrl(id);
}
