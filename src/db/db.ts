import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Candidate, Collection, Override, Sentence, AppSettings } from '../core/types.ts';

export interface MetacomEntry {
  /** Path relative to the chosen root, used as the symbol id. */
  path: string;
  /** Filename without extension, cleaned up for display. */
  label: string;
  /** Lowercased, umlaut-folded label tokens for matching. */
  terms: string[];
}

interface BildhaftDB extends DBSchema {
  collections: { key: string; value: Collection };
  sentences: {
    key: string;
    value: Sentence;
    indexes: { byNormalized: string; byCollection: string; byUpdated: number };
  };
  overrides: { key: string; value: Override; indexes: { byProvider: string } };
  settings: { key: string; value: AppSettings };
  /** ARASAAC search results, cached so repeated lines cost no network. */
  arasaacSearch: { key: string; value: { lemma: string; candidates: Candidate[]; ts: number } };
  /** ARASAAC image blobs, cached so a session works offline once fetched. */
  arasaacImages: { key: string; value: { id: string; blob: Blob; ts: number } };
  /**
   * METACOM filename index. This never leaves the browser — see the licensing
   * rules in the README. It is derived from the user's own licensed files.
   */
  metacomIndex: { key: string; value: { key: string; rootName: string; entries: MetacomEntry[]; ts: number } };
  /** Persisted FileSystemDirectoryHandle, so the folder pick is a one-time step. */
  handles: { key: string; value: { key: string; handle: unknown } };
}

const DB_NAME = 'bildhaft';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<BildhaftDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<BildhaftDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BildhaftDB>(DB_NAME, DB_VERSION, {
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
      },
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
  db.createObjectStore('arasaacSearch', { keyPath: 'lemma' });
  db.createObjectStore('arasaacImages', { keyPath: 'id' });
  db.createObjectStore('metacomIndex', { keyPath: 'key' });
  db.createObjectStore('handles', { keyPath: 'key' });
}

export type { BildhaftDB };
