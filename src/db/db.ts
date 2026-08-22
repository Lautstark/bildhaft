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

/** Rescued from the v2 database during the upgrade. See the v3 step below. */
let legacyMetacomHandle: unknown = null;

/**
 * The METACOM folder handle from before the move to bildquelle, if this browser
 * had one. Returns it once and forgets it: whoever takes it owns it.
 */
export function takeLegacyMetacomHandle(): FileSystemDirectoryHandle | null {
  const handle = legacyMetacomHandle as FileSystemDirectoryHandle | null;
  legacyMetacomHandle = null;
  return handle;
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
    opened = openDB<BildhaftDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          createStores(db);
          return;
        }

        if (oldVersion < 2) {
          /*
           * v1 -> v2. "Sitzung" became "Sammlung", and the reviewed/archived
           * flags were dropped. Existing work is migrated rather than discarded.
           *
           * Only transaction-derived promises are awaited here — awaiting anything
           * else would let the versionchange transaction commit underneath us.
           */
          const legacy = tx as unknown as {
            objectStore(name: string): {
              getAll(): Promise<Record<string, unknown>[]>;
              put(value: unknown): Promise<unknown>;
              deleteIndex(name: string): void;
              createIndex(name: string, path: string): unknown;
              indexNames: DOMStringList;
            };
          };

          const collections = db.createObjectStore('collections', { keyPath: 'id' });

          if (db.objectStoreNames.contains('sessions' as never)) {
            for (const old of await legacy.objectStore('sessions').getAll()) {
              await collections.put({
                id: old.id as string,
                name: (old.name as string) ?? 'Sammlung',
                sentenceIds: (old.sentenceIds as string[]) ?? [],
                createdAt: (old.createdAt as number) ?? Date.now(),
                updatedAt: (old.updatedAt as number) ?? Date.now(),
              });
            }
            db.deleteObjectStore('sessions' as never);
          }

          const sentences = legacy.objectStore('sentences');
          if (sentences.indexNames.contains('bySession')) sentences.deleteIndex('bySession');

          for (const row of await sentences.getAll()) {
            const next: Record<string, unknown> = {
              ...row,
              collectionId: row.collectionId ?? row.sessionId,
            };
            delete next.sessionId;
            delete next.reviewed;
            await sentences.put(next);
          }

          sentences.createIndex('byCollection', 'collectionId');
        }

        if (oldVersion < 3) {
          /*
           * v2 -> v3. The symbol caches move to bildquelle's own database.
           *
           * The ARASAAC stores are pure caches and simply go; they refill on
           * first use. The METACOM folder handle is not a cache — losing it
           * means asking the user to pick their licensed folder all over again —
           * so it is carried out of the transaction in memory and handed to
           * bildquelle on startup. The filename index is deliberately *not*
           * carried over: bildquelle rebuilds it from the folder itself, which
           * keeps that data something only it ever produces.
           */
          const legacy = tx as unknown as {
            objectStore(name: string): { get(key: string): Promise<{ handle?: unknown } | undefined> };
          };

          if (db.objectStoreNames.contains('handles' as never)) {
            const row = await legacy.objectStore('handles').get('metacomDir');
            legacyMetacomHandle = row?.handle ?? null;
          }

          for (const name of ['arasaacSearch', 'arasaacImages', 'metacomIndex', 'handles'] as const) {
            if (db.objectStoreNames.contains(name as never)) db.deleteObjectStore(name as never);
          }
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
