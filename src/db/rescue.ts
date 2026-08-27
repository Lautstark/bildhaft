/** Getting the data out of a database this code has refused to touch.
 *
 * migrations.ts is the ordinary path: an ordered step per version, run inside
 * the upgrade transaction. This is what is left when there is no step for a
 * version, or when a database is not the shape its version claims — both of
 * which leave the browser holding everything it had, and the page looking at a
 * getDB() that rejected.
 *
 * What a person is owed at that moment, before they agree to discard anything,
 * is the contents in a file. This makes that file.
 *
 * **It is not an export.** `exportImport.ts` writes a documented format with a
 * reader on the other side, and reaching it needs the records to be the shape
 * this build expects — which is precisely what is not true here. This is a raw
 * dump of records nothing in this repository knows the shape of, and the file
 * says so in its own notice. Anybody restoring from it is reading it by hand.
 *
 * **The caches are left out**, and that is the one place this diverges from a
 * verbatim dump. A database old enough to be refused still carries the stores
 * v3 handed to bildquelle: cached ARASAAC pictures, and a `metacomIndex` built
 * from the filenames in somebody's own licensed METACOM folder. They refill
 * from their sources, so they are not somebody's work; and the second is
 * derived from licensed material this product otherwise takes care not to
 * write anywhere. `handles` goes with them because a directory handle does not
 * survive JSON at all — it would arrive in the file as an empty object, which
 * is a promise the file cannot keep. Everything else is carried, including
 * stores this build has never heard of, because on this path an unknown store
 * is the most likely place for somebody's work to be.
 *
 * The base64 below is why nothing in here may be called from inside the upgrade
 * transaction — awaiting anything that is not a request on that transaction
 * commits it underneath the caller. See migrations.ts.
 */

import { openDB } from 'idb';

/** Every store in a database, as it was found. Keys and values separately,
 *  because two of these stores have no keyPath and the key is not in the
 *  record. */
export interface Dump {
  version: number;
  stores: Record<string, { keys: IDBValidKey[]; values: unknown[] }>;
  /** Store names that were deliberately not read. Named in the file, so the
   *  person holding it knows what it is not. */
  skipped: string[];
}

export const RESCUE_FORMAT = 'bildhaft.rettung' as const;

/** Caches and the folder handle. See the note at the head of this file. */
const SKIP = ['arasaacSearch', 'arasaacImages', 'metacomIndex', 'handles'];

const DB_NAME = 'bildhaft';

/** Every record in whatever version of the database is on disk, without
 *  upgrading it.
 *
 * `openDB` with no version opens what is there and never fires an upgrade,
 * which is the only way to read a database this code has just refused. The
 * connection is closed again immediately: holding it would be this tab blocking
 * its own next open, which is the failure db.ts's `blocked` handler is for —
 * and the next thing that happens here may be a delete, which waits on exactly
 * that.
 *
 * One caveat worth writing down rather than leaving to be discovered: a
 * no-version open of a database that is *not* there creates it, empty, at
 * version 1. Harmless on this path — nothing reaches here except after an open
 * that refused, so there is one — and an empty dump reads as nothing to rescue
 * rather than as an error. */
export async function dumpEverything(): Promise<Dump> {
  const db = await openDB(DB_NAME);
  try {
    const stores: Dump['stores'] = {};
    const skipped: string[] = [];
    for (const name of [...db.objectStoreNames]) {
      if (SKIP.includes(name)) {
        skipped.push(name);
        continue;
      }
      // One transaction per store rather than one over all of them: this runs
      // on a page that is already refusing to start, and a store that will not
      // read should cost its own records rather than everybody else's.
      const tx = db.transaction(name, 'readonly');
      const held = tx.objectStore(name);
      stores[name] = { keys: await held.getAllKeys(), values: await held.getAll() };
      await tx.done;
    }
    return { version: db.version, stores, skipped };
  } finally {
    db.close();
  }
}

/** Bytes as base64, in chunks.
 *
 * `fromCharCode(...)` over a whole picture overflows the argument list at
 * whatever size the browser decides, and an own picture is exactly the record
 * large enough to find that out. */
function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let from = 0; from < view.length; from += 0x8000) {
    binary += String.fromCharCode(...view.subarray(from, from + 0x8000));
  }
  return btoa(binary);
}

/** A record with its bytes spelled out. Walks the value, because an own picture
 *  is a Blob sitting on a property rather than a record of its own. */
async function spell(value: unknown): Promise<unknown> {
  // Marked rather than bare, because the person reading this file by hand is
  // owed the difference between a picture and an object that happens to have a
  // `base64` field.
  if (value instanceof Blob) {
    return { kind: 'blob', type: value.type, base64: toBase64(await value.arrayBuffer()) };
  }
  if (value instanceof ArrayBuffer) return { kind: 'bytes', base64: toBase64(value) };
  if (Array.isArray(value)) return Promise.all(value.map(spell));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, held] of Object.entries(value)) out[key] = await spell(held);
    return out;
  }
  return value;
}

/** Every record, ready for JSON.stringify.
 *
 * The notice is passed in for the reason exportImport.ts's is: this module has
 * no language, and the caller has the text table. */
export async function asFile(dump: Dump, notice: string): Promise<unknown> {
  const stores: Record<string, { key: unknown; value: unknown }[]> = {};
  for (const [name, held] of Object.entries(dump.stores)) {
    stores[name] = await Promise.all(held.keys.map(async (key, at) => ({
      key: typeof key === 'string' || typeof key === 'number' ? key : String(key),
      value: await spell(held.values[at]),
    })));
  }
  return {
    format: RESCUE_FORMAT,
    version: dump.version,
    exportedAt: new Date().toISOString(),
    notice,
    skipped: dump.skipped,
    stores,
  };
}

/** How many records are in hand, for the sentence that says what the file
 *  holds. A person cannot check a claim they were not given a number for. */
export const countRecords = (dump: Dump): number =>
  Object.values(dump.stores).reduce((total, held) => total + held.values.length, 0);
