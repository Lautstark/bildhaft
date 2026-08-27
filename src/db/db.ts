import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Collection, Override, OwnImage, Sentence, AppSettings } from '../core/types.ts';
import { migrate, WRONG_SHAPE, type OldDB, type OldTx } from './migrations.ts';

interface BildhaftDB extends DBSchema {
  collections: { key: string; value: Collection };
  sentences: {
    key: string;
    value: Sentence;
    indexes: { byNormalized: string; byCollection: string; byUpdated: number };
  };
  overrides: { key: string; value: Override; indexes: { byProvider: string } };
  settings: { key: string; value: AppSettings };
  ownImages: { key: string; value: OwnImage };
}

/*
 * Cached symbols used to live here too. They are bildquelle's now: it owns a
 * database of its own, so the METACOM rules are enforced in one place rather
 * than in every app that shows a symbol. v3 hands the stores over.
 */

/*
 * This number is not free to change. adr/0001 — *an upgrade has a step for
 * every version it crosses, or it refuses and changes nothing* — so a bump
 * costs a step in migrations.ts whose `to` is the new number, and the step may
 * do only what that version changed, in requests on the upgrade transaction and
 * nothing else. Forget it and the page will not start and will say why, which
 * is the failure this is arranged around: loud, in the minute after the
 * mistake, rather than a database quietly misread for weeks.
 */
const DB_NAME = 'bildhaft';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<BildhaftDB>> | null = null;

/** What an upgrade did, for the sentence the page says about it. */
export interface Migrated {
  from: number;
  to: number;
  /** Counted rather than assumed — the one number a person can check. */
  collections: number;
}

/* The two things the upgrade callback has to hand back to getDB().
 *
 * Module state rather than return values, because the callback's return value
 * goes to idb and nowhere else, and because openDB() resolves through an event
 * rather than through that function. Only one open is ever in flight — getDB()
 * memoises — so there is nothing here for a second one to trample. */
let refusal: Error | null = null;
let note: Migrated | null = null;

/** What the last upgrade carried across, once. Cleared by the read, because
 *  this is a sentence to be said rather than a state to be drawn: boot says it
 *  after the first render and nobody else asks. */
export function takeMigrationNote(): Migrated | null {
  const what = note;
  note = null;
  return what;
}

/** Set when another tab is holding an older version of the database open. */
let blockedByOtherTab = false;
const blockedListeners = new Set<() => void>();

export function isBlockedByOtherTab(): boolean {
  return blockedByOtherTab;
}

export function onBlockedChange(listener: () => void): () => void {
  blockedListeners.add(listener);
  return () => blockedListeners.delete(listener);
}

function setBlocked(value: boolean): void {
  if (blockedByOtherTab === value) return;
  blockedByOtherTab = value;
  for (const listener of blockedListeners) listener();
}

export function getDB(): Promise<IDBPDatabase<BildhaftDB>> {
  if (!dbPromise) {
    let opened: Promise<IDBPDatabase<BildhaftDB>>;
    refusal = null;
    note = null;
    opened = openDB<BildhaftDB>(DB_NAME, DB_VERSION, {
      /*
       * One step per version, in order, inside the transaction that either
       * commits all of them or none — adr/0001, and migrations.ts holds the
       * table.
       *
       * It used to be `createStores(db)` and nothing else: create what is
       * missing. That was right for adding a store to a database holding real
       * work, which is what v4 did, and wiping a library of Sammlungen to make
       * room for a feature would have been an odd way to add one. It had no
       * answer for any other kind of change — a store whose records change
       * shape is read by new code as if nothing happened, and a version nobody
       * wrote a step for looks exactly like a version that needed none.
       *
       * `async`, and every await inside it and inside every step is a request
       * on `tx` with nothing between them. That is not a style note: a
       * versionchange transaction stays open only while requests are
       * outstanding on it, so one await on anything else commits it underneath
       * a half-run migration. migrations.ts states the rule at its head.
       *
       * A throw does *not* abort an async upgrade callback the way it aborts a
       * synchronous one — the rejection escapes into nothing idb is watching
       * and the transaction commits regardless, which would be a half-applied
       * migration with no error anywhere. So the refusal is an explicit
       * abort(), and what caused it is left where getDB() can pick it up.
       */
      async upgrade(db, from, _to, tx) {
        try {
          // A browser that has never been here. The only other way into
          // createStores is discardEverything(), which deletes the database
          // first and so arrives here as this same case.
          if (from === 0) {
            createStores(db);
            return;
          }

          await migrate(db as unknown as OldDB, tx as unknown as OldTx, from, DB_VERSION);
          // Counted here because it is one more request on a transaction that
          // is still open, and because a number nobody counted is a claim.
          note = { from, to: DB_VERSION, collections: await tx.objectStore('collections').count() };
        } catch (error) {
          refusal = error instanceof Error ? error : new Error(WRONG_SHAPE);
          note = null;
          // The abort rejects tx.done, and nothing else is listening to it.
          tx.done.catch(() => undefined);
          tx.abort();
        }
      },

      /*
       * Another tab still has an older version open, so this upgrade cannot
       * proceed. Without these handlers openDB simply never settles, and every
       * caller that awaits it — crucially getImageUrl — hangs forever, which
       * presents as symbols stuck on their loading spinner.
       */
      blocked() {
        setBlocked(true);
      },
      /* We are the old tab standing in a newer one's way. Step aside. */
      blocking() {
        opened.then((db) => db.close()).catch(() => undefined);
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).then(
      (db) => {
        setBlocked(false);
        try {
          assertShape(db);
        } catch (error) {
          // Nothing here is usable and holding the connection would leave this
          // tab blocking its own next open — including the delete that a
          // discard has to make.
          db.close();
          throw error;
        }
        return db;
      },
      (error: unknown) => {
        // An aborted upgrade surfaces as AbortError, which says nothing about
        // why. The reason was put aside where the abort happened.
        throw refusal ?? error;
      },
    );

    dbPromise = opened.catch((err) => {
      // Let the next call try again rather than caching a rejected promise.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** The stores this code reads, and the indexes it queries them through.
 *
 * A second statement of the schema, and the duplication is the point: this one
 * is read on the way *out* of an open, where createStores() below is only ever
 * run on the way in. A fresh database satisfying it is asserted by
 * tests/unit/db-migrations.test.ts, so the two cannot drift apart unnoticed. */
const SHAPE: Record<string, readonly string[]> = {
  collections: [],
  sentences: ['byNormalized', 'byCollection', 'byUpdated'],
  overrides: ['byProvider'],
  settings: [],
  ownImages: [],
};

/** Refuses a database that is not the shape its version claims to be.
 *
 * The steps assert their own preconditions, which catches this while a database
 * is being upgraded. This catches the one case no upgrade can ever see again:
 * the build before adr/0001 met a v1 database, created the stores it was
 * missing, left `sentences` without its `byCollection` index, and stamped the
 * result **version 4**. Nothing will ever upgrade it, and every read through
 * that index throws NotFoundError into whatever happened to be awaiting it.
 * This turns that into the same refusal a missing step gets: the page stops and
 * offers the records as a file.
 *
 * Stores it does not know about are ignored on purpose. A database that was on
 * v2 still carries the caches v3 removed, and that is junk rather than grounds
 * for refusing somebody their library. */
function assertShape(db: IDBPDatabase<BildhaftDB>): void {
  for (const [name, indexes] of Object.entries(SHAPE)) {
    if (!db.objectStoreNames.contains(name as never)) throw new Error(WRONG_SHAPE);
    if (indexes.length === 0) continue;
    // Cast because both lists are typed to this schema's own literals, and the
    // question being asked is exactly whether a database answers to them.
    const names = db.transaction(name as never).store.indexNames as unknown as DOMStringList;
    for (const index of indexes) {
      if (!names.contains(index)) throw new Error(WRONG_SHAPE);
    }
  }
}

/** Go ahead and drop what could not be migrated.
 *
 * Armed by a person, in a sheet that has already handed them the file — see
 * ui/rescue.ts. It is the only destructive path left in this file, and the
 * database is deleted outright rather than upgraded-with-a-flag the way
 * vorlaut does it: bildhaft refuses in two places, and one of them is a
 * database already sitting at the current version, where no upgrade would fire
 * to carry a flag into.
 *
 * The memoised promise goes with it — the open that refused is cached as a
 * rejected one — and any connection it holds is closed first, because
 * deleteDatabase waits on open connections and fires `blocked` rather than
 * failing. */
export async function discardEverything(): Promise<void> {
  const held = dbPromise;
  dbPromise = null;
  if (held) await held.then((db) => db.close(), () => undefined);
  await deleteDB(DB_NAME, { blocked: () => setBlocked(true) });
}

/** Creates whatever is missing. Safe to run against a database of any age. */
function createStores(db: IDBPDatabase<BildhaftDB>): void {
  const has = (name: string) => db.objectStoreNames.contains(name as never);

  if (!has('collections')) db.createObjectStore('collections', { keyPath: 'id' });

  if (!has('sentences')) {
    const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
    sentences.createIndex('byNormalized', 'normalizedInput');
    sentences.createIndex('byCollection', 'collectionId');
    sentences.createIndex('byUpdated', 'updatedAt');
  }

  if (!has('overrides')) {
    const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
    overrides.createIndex('byProvider', 'provider');
  }

  if (!has('settings')) db.createObjectStore('settings');
  if (!has('ownImages')) db.createObjectStore('ownImages', { keyPath: 'id' });
}

export type { BildhaftDB };
