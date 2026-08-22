import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Collection, Override, Sentence, AppSettings } from '../core/types.ts';

interface BildhaftDB extends DBSchema {
  collections: { key: string; value: Collection };
  sentences: {
    key: string;
    value: Sentence;
    indexes: { byNormalized: string; byCollection: string; byUpdated: number };
  };
  overrides: { key: string; value: Override; indexes: { byProvider: string } };
  settings: { key: string; value: AppSettings };
}

/*
 * Cached symbols used to live here too. They are bildquelle's now: it owns a
 * database of its own, so the METACOM rules are enforced in one place rather
 * than in every app that shows a symbol. v3 hands the stores over.
 */

const DB_NAME = 'bildhaft';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<BildhaftDB>> | null = null;

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
    opened = openDB<BildhaftDB>(DB_NAME, DB_VERSION, {
      /*
       * No migrations. This is a single-user tool, and carrying schema history
       * forward cost more than the data was worth: every version bump added a
       * branch, and two of them shipped bugs. An older database is simply
       * rebuilt empty, which is the behaviour the one user asked for.
       */
      upgrade(db) {
        for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
        createStores(db);
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
    }).then((db) => {
      setBlocked(false);
      return db;
    });

    dbPromise = opened.catch((err) => {
      // Let the next call try again rather than caching a rejected promise.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function createStores(db: IDBPDatabase<BildhaftDB>): void {
  db.createObjectStore('collections', { keyPath: 'id' });

  const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
  sentences.createIndex('byNormalized', 'normalizedInput');
  sentences.createIndex('byCollection', 'collectionId');
  sentences.createIndex('byUpdated', 'updatedAt');

  const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
  overrides.createIndex('byProvider', 'provider');

  db.createObjectStore('settings');
}

export type { BildhaftDB };
