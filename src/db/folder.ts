import { Ablage, announceFolder, announcedFolder, stopAnnouncing } from '@lautstark/sicherung/ablage';
import type { Collection, OwnImage, Override, Sentence } from '../core/types.js';

/**
 * bildhaft's work in a folder, rather than only in this browser.
 *
 * A household keeps its collections *either* in IndexedDB *or* in a folder it
 * chose — never in both as sources, so there is never a second truth to
 * reconcile. Where a folder is connected it is the truth and IndexedDB is a copy
 * of it: read wholesale on start, written to on every edit, and served read-only
 * while the folder is out of reach. See sicherung's adr/0001 and Wochenwerk's
 * ADR 002, which is where this arrangement was first built and first broke.
 *
 * Nothing here decides anything about a record. It moves records, and it says
 * which direction they went.
 */

export const KINDS = ['sammlungen', 'saetze', 'woerterbuch', 'bilder'] as const;
export type Kind = (typeof KINDS)[number];

/** The name every Lautstark programme files under; bildhaft's own is `HOME/bildhaft/`. */
export const HOME = 'Lautstark';
export const APP = 'bildhaft';

export const ablage = new Ablage({ app: APP, kinds: KINDS });
export const supported = Ablage.supported;

/** Whether the folder is the store rather than a copy of one. */
export const isStore = () =>
  ablage.status.kind !== 'off' && ablage.status.kind !== 'unsupported';
/** Whether it is the store but currently out of reach. */
export const isStale = () => ablage.status.kind === 'stale';

/*
 * A dictionary entry is keyed by the word it is about — `de:arasaac:hund` — and
 * that is not a filename and not a UUID. Rather than rewrite a store that works,
 * the *file* gets an id derived from the key: the same word always lands on the
 * same file, on every device, and the key itself travels inside the record where
 * it has always been.
 *
 * A hash and not a counter, because two devices that have never met must agree
 * on the name without asking each other. Formatted 8-4-4-4-12 because that is
 * what the folder recognises as a record.
 */
const digested = new Map<string, string>();
export async function fileNameFor(key: string): Promise<string> {
  const known = digested.get(key);
  if (known) return known;
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
  );
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  digested.set(key, id);
  return id;
}

/* What each kind looks like as a record in the folder. The shapes are the
   product's own, minus what cannot travel: a picture's bytes go beside it, and
   an override borrows an id it never had. */
const asStored = {
  /* Spread rather than passed through: a declared interface is not assignable to
     the package's open record shape, and the copy costs nothing. */
  sammlungen: (item: Collection) => ({ ...item }),
  saetze: (item: Sentence) => ({ ...item }),
  bilder: ({ blob: _blob, ...rest }: OwnImage) => ({ ...rest, updatedAt: rest.createdAt }),
} as const;

/* A write reaches the folder only where the folder is the store, and never while
   it is stale — a copy that took writes nobody else can see would be the second
   source of truth this whole arrangement exists to avoid. */
const canWrite = () => isStore() && !isStale();

export async function fileCollection(item: Collection): Promise<void> {
  if (canWrite()) await ablage.write('sammlungen', asStored.sammlungen(item));
}
export async function fileSentence(item: Sentence): Promise<void> {
  if (canWrite()) await ablage.write('saetze', asStored.saetze(item));
}
export async function fileOverride(item: Override): Promise<void> {
  if (!canWrite()) return;
  await ablage.write('woerterbuch', { ...item, id: await fileNameFor(item.key) });
}
export async function fileImage(item: OwnImage): Promise<void> {
  if (!canWrite()) return;
  await ablage.write('bilder', asStored.bilder(item));
  await ablage.writeFile('bilder', item.id, item.blob);
}

export async function unfile(kind: Kind, id: string): Promise<void> {
  if (canWrite()) await ablage.remove(kind, id);
}
export async function unfileOverride(key: string): Promise<void> {
  if (canWrite()) await ablage.remove('woerterbuch', await fileNameFor(key));
}

/* A batch — a collection imported, everything cleared — happens inside one
   IndexedDB transaction, and reaching into that to file each record would put a
   folder write inside a transaction that has to stay open. So a batch is
   mirrored afterwards, wholesale: what the browser now holds is written where
   the folder disagrees, and what the browser no longer holds is removed.

   Through `writeAll`, so a folder that goes out of reach partway stops the batch
   instead of running silently to the end writing nothing. */
export async function pushKind(
  kind: Kind,
  records: { id: string; updatedAt: number }[],
): Promise<void> {
  if (!canWrite()) return;
  const there = new Map((await ablage.list(kind)).map((item) => [item.id, item.updatedAt]));
  const here = new Set(records.map((record) => record.id));
  await ablage.writeAll(
    kind,
    records.filter((record) => there.get(record.id) !== record.updatedAt),
  );
  for (const id of there.keys()) if (!here.has(id)) await ablage.remove(kind, id);
}

export const readKind = <T>(kind: Kind) => ablage.all(kind) as Promise<T[]>;
export const readImage = (id: string) => ablage.readFile('bilder', id);
export const changes = () => ablage.poll();
export const conflicts = () => ablage.conflicts();
export const adopted = () => ablage.adopted();
export const adopt = (everything: Record<string, { id: string; updatedAt: number }[]>) =>
  ablage.adopt(everything);
export const folders = () => ablage.folders();
export const nest = (name: string) => ablage.nest(name);
export const metacomInFolder = () => ablage.folderHolding('METACOM_Symbole');

/* Somebody else's edit reaches this browser as a file that changed under it. A
   poll rather than a subscription, because a folder that syncs from elsewhere has
   nothing to notify with — the file simply differs the next time it is read. */
export const watchFolder = (onChange: () => void) =>
  ablage.watch(30_000, (found) => {
    if (found.length) onChange();
  });

/* Telling the other Lautstark programmes on this device which folder is in use,
   and hearing what they said. Only ever because somebody switched it on — see
   the package for why that is what makes it lawful. */
export const tellOthers = (folder: string) => announceFolder(APP, folder);
export const stopTelling = () => stopAnnouncing();
export const toldByOthers = () => {
  const said = announcedFolder();
  return said && said.app !== APP ? said : null;
};
