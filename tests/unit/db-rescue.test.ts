import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, openDB } from 'idb';

import { asFile, countRecords, dumpEverything, RESCUE_FORMAT } from '../../src/db/rescue.ts';

/**
 * The file a person is owed before anything discards their records.
 *
 * Two properties are worth a test rather than a reading. The first is that this
 * reads a database *as found*, at whatever version it is on, without upgrading
 * it — it exists precisely for databases db.ts has refused to touch. The second
 * is what it leaves out: cached symbols and an index built from the filenames
 * in somebody's own licensed METACOM folder are not this person's work, and
 * writing them into a file is not something this product does by accident.
 */

const DB_NAME = 'bildhaft';

beforeEach(async () => {
  await deleteDB(DB_NAME);
});

afterEach(async () => {
  await deleteDB(DB_NAME);
});

/** An old database with work in it, a picture, and the caches beside them. */
async function seed(): Promise<void> {
  const db = await openDB(DB_NAME, 2, {
    upgrade(db) {
      db.createObjectStore('collections', { keyPath: 'id' });
      db.createObjectStore('ownImages', { keyPath: 'id' });
      db.createObjectStore('settings');
      db.createObjectStore('arasaacImages', { keyPath: 'id' });
      db.createObjectStore('metacomIndex', { keyPath: 'key' });
      db.createObjectStore('handles', { keyPath: 'key' });
    },
  });
  await db.put('collections', { id: 'c1', name: 'Der Grüffelo', sentenceIds: [] });
  await db.put('ownImages', {
    id: 'i1', name: 'Bente.png', type: 'image/png',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    createdAt: 1,
  });
  await db.put('settings', { activeProvider: 'arasaac' }, 'app');
  await db.put('arasaacImages', { id: '2462', blob: new Blob(['pixels']) });
  await db.put('metacomIndex', { key: 'root', entries: ['Apfel_01.png'] });
  await db.put('handles', { key: 'metacomDir', handle: {} });
  db.close();
}

describe('the rescue dump', () => {
  it('reads the database at the version it is on, without upgrading it', async () => {
    await seed();
    const dump = await dumpEverything();

    expect(dump.version).toBe(2);
    expect(Object.keys(dump.stores).sort()).toEqual(['collections', 'ownImages', 'settings']);
    expect(dump.stores.collections!.values).toEqual([
      { id: 'c1', name: 'Der Grüffelo', sentenceIds: [] },
    ]);
    // Out of line, so the key is not in the record and has to travel beside it.
    expect(dump.stores.settings!.keys).toEqual(['app']);
    expect(countRecords(dump)).toBe(3);

    // And it left the database where it found it.
    const found = await openDB(DB_NAME);
    expect(found.version).toBe(2);
    found.close();
  });

  it('leaves the caches and the folder handle out, and names them', async () => {
    await seed();
    const dump = await dumpEverything();

    expect(dump.skipped.sort()).toEqual(['arasaacImages', 'handles', 'metacomIndex']);
    expect(Object.keys(dump.stores)).not.toContain('metacomIndex');

    const file = await asFile(dump, 'notice') as {
      format: string; skipped: string[]; stores: Record<string, unknown>;
    };
    expect(file.format).toBe(RESCUE_FORMAT);
    // Said in the file rather than only in the code, so the person holding it
    // knows what it is not.
    expect(file.skipped).toContain('metacomIndex');
  });

  it('spells a picture out as base64, so the file survives JSON', async () => {
    await seed();
    const file = await asFile(await dumpEverything(), 'notice') as {
      stores: Record<string, { key: unknown; value: Record<string, unknown> }[]>;
    };

    const picture = file.stores.ownImages![0]!;
    expect(picture.key).toBe('i1');
    expect(picture.value.name).toBe('Bente.png');
    // The three bytes the picture was seeded with, and the mark that says what
    // they are: somebody reading this file by hand is owed the difference between
    // a picture and an object that happens to carry a base64 field.
    expect(picture.value.blob)
      .toEqual({ kind: 'blob', type: 'image/png', base64: 'AQID' });
    // A round trip through JSON is the whole point of the conversion.
    expect(() => JSON.stringify(file)).not.toThrow();
  });

  it('carries a store this build has never heard of', async () => {
    // On this path an unknown store is the likeliest place for somebody's work
    // to be, so the dump is inclusive by default and only the named caches go.
    await seed();
    const db = await openDB(DB_NAME, 3, {
      upgrade(db) { db.createObjectStore('etwasNeues', { keyPath: 'id' }); },
    });
    await db.put('etwasNeues', { id: 'x', kept: true });
    db.close();

    const dump = await dumpEverything();
    expect(dump.stores.etwasNeues!.values).toEqual([{ id: 'x', kept: true }]);
  });
});
