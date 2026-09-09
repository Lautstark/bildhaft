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

/**
 * The Wortschatz, in a compartment of its own beside bildhaft's.
 *
 * The words a household has settled belong to the household, not to the
 * programme that happened to be open when they settled them — that is the whole
 * argument of the Wortschatz, and it stops being true the moment the records
 * live under `bildhaft/`. So they live under `wortschatz/`, in the same folder,
 * which is a place a second programme can read without knowing anything about
 * this one.
 *
 * `follows` is what makes that free: it borrows the folder bildhaft already
 * asked for, so nobody is asked to pick the same folder twice under two names
 * that look alike. It also cannot choose or forget one — see the package.
 *
 * Nothing reads it yet but bildhaft. What this buys today is that the records
 * stop accumulating in the wrong place.
 */
export const SHARED = 'wortschatz';
export const SHARED_KINDS = ['woerterbuch'] as const;
export const shared = new Ablage({ app: SHARED, kinds: SHARED_KINDS, follows: APP });

/** Which Ablage a kind lives in. One kind has moved out; the rest are bildhaft's. */
const homeOf = (kind: Kind | 'woerterbuch') => (kind === 'woerterbuch' ? shared : ablage);

export const supported = Ablage.supported;

/** Whether the folder is the store rather than a copy of one. */
export const isStore = () =>
  ablage.status.kind !== 'off' && ablage.status.kind !== 'unsupported';
/** Whether it is the store but currently out of reach. */
export const isStale = () => ablage.status.kind === 'stale';

/**
 * How far a „Alles löschen" would reach.
 *
 * Three answers rather than a boolean, because the sentence differs in each.
 * With a folder as the store, clearEverything() removes the files — so it
 * removes them on every device the household has, which „endgültig gelöscht"
 * said nothing about. And with the folder out of reach it would empty this
 * browser while the folder kept everything and handed it back on the next
 * start: a delete that undoes itself. That one is refused rather than asked.
 */
export const wipeReaches = (): 'browser' | 'folder' | 'unreachable' =>
  !isStore() ? 'browser' : isStale() ? 'unreachable' : 'folder';

/** The folder's own name, for a sentence that has to point at it. */
export const folderName = (): string =>
  'folder' in ablage.status ? ablage.status.folder : '';

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
/* The compartment has its own status, and a write that goes nowhere because it
   was never restored is the quietest kind of loss. It borrows bildhaft's folder,
   so in practice the two agree — this is the guard for the case where they do
   not. */
const canWriteShared = () =>
  canWrite() && shared.status.kind !== 'off' && shared.status.kind !== 'unsupported'
  && shared.status.kind !== 'stale';

export async function fileCollection(item: Collection): Promise<void> {
  if (canWrite()) await ablage.write('sammlungen', asStored.sammlungen(item));
}
export async function fileSentence(item: Sentence): Promise<void> {
  if (canWrite()) await ablage.write('saetze', asStored.saetze(item));
}
export async function fileOverride(item: Override): Promise<void> {
  if (!canWriteShared()) return;
  await shared.write('woerterbuch', { ...item, id: await fileNameFor(item.key) });
}
export async function fileImage(item: OwnImage): Promise<void> {
  if (!canWrite()) return;
  await ablage.write('bilder', asStored.bilder(item));
  await ablage.writeFile('bilder', item.id, item.blob);
}

export async function unfile(kind: Kind, id: string): Promise<void> {
  if (canWrite()) await homeOf(kind).remove(kind, id);
}
export async function unfileOverride(key: string): Promise<void> {
  if (canWriteShared()) await shared.remove('woerterbuch', await fileNameFor(key));
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
  const home = homeOf(kind);
  const there = new Map((await home.list(kind)).map((item) => [item.id, item.updatedAt]));
  const here = new Set(records.map((record) => record.id));
  await home.writeAll(
    kind,
    records.filter((record) => there.get(record.id) !== record.updatedAt),
  );
  for (const id of there.keys()) if (!here.has(id)) await home.remove(kind, id);
}

export const readKind = <T>(kind: Kind) => homeOf(kind).all(kind) as Promise<T[]>;
export const readImage = (id: string) => ablage.readFile('bilder', id);
/* Both compartments, because a word changed on another device lands in one of
   them and a Sammlung in the other, and a caller asking "what moved" means the
   folder rather than a subtree of it. */
export const changes = async () => [...await ablage.poll(), ...await shared.poll()];
export const conflicts = async () => [...await ablage.conflicts(), ...await shared.conflicts()];
export const adopted = () => ablage.adopted();

/** bildhaft's own records go under `bildhaft/`; the Wortschatz goes beside it. */
export async function adopt(
  everything: Record<string, { id: string; updatedAt: number }[]>,
): Promise<ReturnType<Ablage['adopt']> extends Promise<infer T> ? T : never> {
  const { woerterbuch = [], ...mine } = everything;
  const went = await ablage.adopt(mine);
  /* Only after bildhaft's own landed. A folder that holds a vocabulary and no
     Sammlungen is a folder somebody has to make sense of; the order makes the
     half-done state the harmless one. */
  if (went.adopted && woerterbuch.length > 0) await shared.adopt({ woerterbuch });
  return went;
}

/**
 * Restores both compartments, in the one order that works.
 *
 * The shared one follows bildhaft's, so it can only find a folder after
 * bildhaft has. Awaited together at boot rather than left to whoever writes
 * first, because the first write is where "it did not save" would appear.
 */
export async function restoreFolder(): Promise<void> {
  await ablage.restore();
  await shared.restore();
}

/**
 * Moves a Wortschatz written before it had a compartment of its own.
 *
 * Copied, checked, and only then removed — the order `adopt()` uses, and for
 * the same reason: a household whose words disappeared between two versions
 * would have no way of knowing they had ever been anywhere. If a single record
 * fails to arrive, the originals are left exactly where they are and the move
 * is simply tried again next time.
 *
 * It runs once in practice, because after it there is nothing under
 * `bildhaft/woerterbuch/` to find. The empty folder is left behind: removing a
 * directory is not something the Ablage does, and an empty one costs nothing.
 */
export async function moveWortschatz(): Promise<number> {
  if (!canWriteShared()) return 0;

  const held = await ablage.all('woerterbuch');
  if (held.length === 0) return 0;

  const there = new Set((await shared.list('woerterbuch')).map((item) => item.id));
  const owed = held.filter((record) => !there.has(record.id));
  if (owed.length > 0) await shared.writeAll('woerterbuch', owed);

  const arrived = new Set((await shared.list('woerterbuch')).map((item) => item.id));
  if (!held.every((record) => arrived.has(record.id))) return 0;

  for (const record of held) await ablage.remove('woerterbuch', record.id);
  return held.length;
}
export const folders = () => ablage.folders();
export const nest = (name: string) => ablage.nest(name);
export const metacomInFolder = () => ablage.folderHolding('METACOM_Symbole');

/* Somebody else's edit reaches this browser as a file that changed under it. A
   poll rather than a subscription, because a folder that syncs from elsewhere has
   nothing to notify with — the file simply differs the next time it is read. */
export const watchFolder = (onChange: () => void) => {
  const stop = [
    ablage.watch(30_000, (found) => { if (found.length) onChange(); }),
    shared.watch(30_000, (found) => { if (found.length) onChange(); }),
  ];
  return () => { for (const end of stop) end(); };
};

/* Telling the other Lautstark programmes on this device which folder is in use,
   and hearing what they said. Only ever because somebody switched it on — see
   the package for why that is what makes it lawful. */
export const tellOthers = (folder: string) => announceFolder(APP, folder);
export const stopTelling = () => stopAnnouncing();
export const toldByOthers = () => {
  const said = announcedFolder();
  return said && said.app !== APP ? said : null;
};
