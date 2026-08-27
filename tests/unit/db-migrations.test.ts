import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB, openDB, type IDBPDatabase } from 'idb';

import {
  MISSING_STEP, WRONG_SHAPE, isRefusal, migrate, plan, type Step,
} from '../../src/db/migrations.ts';

/**
 * A migration test that never migrates is the failure mode to avoid here.
 *
 * So every case below seeds a real database at a real old version, written the
 * way that version wrote it — the store names, the key paths and the indexes
 * taken from this repository's own history — and then imports db.ts and asks
 * it ordinary questions. Nothing is stubbed and no shape is hand-fed to a
 * function; the module opens what is on the record and either carries it or
 * refuses it.
 *
 * The two refusals are what most of this is about. bildhaft's own table has a
 * hole in it on purpose — versions 1 and 2 have no step, per adr/0001 — so the
 * refusal is tested through the real STEPS as well as through an injected table
 * that has a hole somewhere else, which is what plan()'s `steps` parameter is
 * for.
 */

const DB_NAME = 'bildhaft';

/** A database at version 1, as `1c81346` wrote it: Sitzungen rather than
 *  Sammlungen, sentences keyed to a session, and the symbol caches that v3
 *  later handed to bildquelle. */
async function seedV1(): Promise<void> {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id' });
      const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
      sentences.createIndex('byNormalized', 'normalizedInput');
      sentences.createIndex('bySession', 'sessionId');
      sentences.createIndex('byUpdated', 'updatedAt');
      const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
      overrides.createIndex('byProvider', 'provider');
      db.createObjectStore('settings');
      db.createObjectStore('arasaacSearch', { keyPath: 'lemma' });
      db.createObjectStore('arasaacImages', { keyPath: 'id' });
      db.createObjectStore('metacomIndex', { keyPath: 'key' });
      db.createObjectStore('handles', { keyPath: 'key' });
    },
  });
  await db.put('sessions', {
    id: 'c1', name: 'Der Grüffelo', sentenceIds: ['s1'], createdAt: 1, updatedAt: 1,
  });
  await db.put('sentences', {
    id: 's1', sessionId: 'c1', reviewed: false, normalizedInput: 'ich möchte einen apfel',
    rawInput: 'Ich möchte einen Apfel', slots: [], createdAt: 1, updatedAt: 1,
  });
  await db.put('arasaacImages', { id: '2462', blob: new Blob(['nope']), ts: 1 });
  db.close();
}

/** A database at version 3, as `2bdbf62` left it: the shape bildhaft has now,
 *  without ownImages. */
async function seedV3(collections = 2): Promise<void> {
  const db = await openDB(DB_NAME, 3, {
    upgrade(db) {
      db.createObjectStore('collections', { keyPath: 'id' });
      const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
      sentences.createIndex('byNormalized', 'normalizedInput');
      sentences.createIndex('byCollection', 'collectionId');
      sentences.createIndex('byUpdated', 'updatedAt');
      const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
      overrides.createIndex('byProvider', 'provider');
      db.createObjectStore('settings');
    },
  });
  for (let at = 0; at < collections; at++) {
    await db.put('collections', {
      id: `c${at}`, name: `Sammlung ${at}`, sentenceIds: at === 0 ? ['s1'] : [],
      createdAt: 1, updatedAt: 1,
    });
  }
  await db.put('sentences', {
    id: 's1', collectionId: 'c0', normalizedInput: 'ich möchte einen apfel',
    rawInput: 'Ich möchte einen Apfel', slots: [], createdAt: 1, updatedAt: 1,
  });
  await db.put('overrides', {
    key: 'arasaac:apfel', provider: 'arasaac', token: 'apfel', symbolId: '2462',
    label: 'Apfel', updatedAt: 1,
  });
  db.close();
}

/**
 * What the build before adr/0001 makes out of a v1 database: version 4, the
 * stores created beside the old ones, and `sentences` still without the
 * `byCollection` index nothing added.
 *
 * This is the case no upgrade can ever see again — the version is already
 * current — and it is why the shape is checked on the way out of an open.
 */
async function seedMangledV4(): Promise<void> {
  const db = await openDB(DB_NAME, 4, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id' });
      const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
      sentences.createIndex('byNormalized', 'normalizedInput');
      sentences.createIndex('byUpdated', 'updatedAt');
      const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
      overrides.createIndex('byProvider', 'provider');
      db.createObjectStore('settings');
      db.createObjectStore('collections', { keyPath: 'id' });
      db.createObjectStore('ownImages', { keyPath: 'id' });
    },
  });
  await db.put('sessions', { id: 'c1', name: 'Der Grüffelo', sentenceIds: [], createdAt: 1, updatedAt: 1 });
  db.close();
}

/** The module, fresh, so its memoised connection belongs to this test alone. */
async function load(): Promise<typeof import('../../src/db/db.ts')> {
  vi.resetModules();
  return import('../../src/db/db.ts');
}

/** Whatever is on disk now, without upgrading it. */
async function asFound(): Promise<IDBPDatabase<unknown>> {
  return openDB(DB_NAME);
}

beforeEach(async () => {
  await deleteDB(DB_NAME);
});

afterEach(async () => {
  await deleteDB(DB_NAME);
});

describe('opening a database', () => {
  it('builds the whole schema for a browser that has never been here', async () => {
    const { getDB, takeMigrationNote } = await load();
    const db = await getDB();

    expect([...db.objectStoreNames].sort())
      .toEqual(['collections', 'overrides', 'ownImages', 'sentences', 'settings']);
    // The other half of assertShape: a fresh database has to satisfy the table
    // db.ts checks every open against, or the two have drifted apart.
    expect([...db.transaction('sentences').store.indexNames].sort())
      .toEqual(['byCollection', 'byNormalized', 'byUpdated']);
    expect([...db.transaction('overrides').store.indexNames]).toEqual(['byProvider']);
    // Nothing was carried, so there is nothing to say about it.
    expect(takeMigrationNote()).toBeNull();
    db.close();
  });

  it('carries a version 3 library across, and says what it carried', async () => {
    await seedV3();
    const { getDB, takeMigrationNote } = await load();
    const db = await getDB();

    expect(db.version).toBe(4);
    expect(db.objectStoreNames.contains('ownImages')).toBe(true);
    expect(await db.count('collections')).toBe(2);
    expect(await db.count('overrides')).toBe(1);
    const rows = await db.getAllFromIndex('sentences', 'byCollection', 'c0');
    expect(rows.map((row) => row.rawInput)).toEqual(['Ich möchte einen Apfel']);

    expect(takeMigrationNote()).toEqual({ from: 3, to: 4, collections: 2 });
    // Once. It is a sentence to be said, not a state to be drawn.
    expect(takeMigrationNote()).toBeNull();
    db.close();
  });

  it('refuses a version it has no step for, and changes nothing', async () => {
    await seedV1();
    const { getDB } = await load();

    const error = await getDB().then(() => null, (failure: unknown) => failure);
    expect(isRefusal(error)).toBe(true);
    expect((error as Error).message).toBe(MISSING_STEP);

    /* The database is where it was. This is what the explicit tx.abort() in
     * db.ts buys: a throw out of an async upgrade callback does not abort the
     * transaction on its own, so without it the version would read 4 here and
     * ownImages would exist. */
    const found = await asFound();
    expect(found.version).toBe(1);
    expect(found.objectStoreNames.contains('ownImages')).toBe(false);
    expect(found.objectStoreNames.contains('collections')).toBe(false);
    expect(await found.get('sessions', 'c1')).toMatchObject({ name: 'Der Grüffelo' });
    expect(await found.count('sentences')).toBe(1);
    found.close();
  });

  it('refuses a database that is not the shape its version claims', async () => {
    await seedMangledV4();
    const { getDB } = await load();

    const error = await getDB().then(() => null, (failure: unknown) => failure);
    expect(isRefusal(error)).toBe(true);
    expect((error as Error).message).toBe(WRONG_SHAPE);

    const found = await asFound();
    expect(await found.get('sessions', 'c1')).toMatchObject({ name: 'Der Grüffelo' });
    found.close();
  });

  it('lets the next call try again rather than caching the refusal', async () => {
    await seedV1();
    const { getDB } = await load();
    await expect(getDB()).rejects.toThrow(MISSING_STEP);
    // Same answer, freshly reached — a rejected promise handed out forever
    // would make the discard below unreachable.
    await expect(getDB()).rejects.toThrow(MISSING_STEP);
  });

  it('starts empty once a person has discarded what could not be read', async () => {
    await seedV1();
    const { getDB, discardEverything, takeMigrationNote } = await load();
    await expect(getDB()).rejects.toThrow(MISSING_STEP);

    await discardEverything();

    const db = await getDB();
    expect(db.version).toBe(4);
    expect(db.objectStoreNames.contains('sessions')).toBe(false);
    expect(await db.count('collections')).toBe(0);
    // A database that has never existed is not a migration, so nothing is
    // claimed about one.
    expect(takeMigrationNote()).toBeNull();
    db.close();
  });
});

describe('plan', () => {
  const stub = (to: number): Step => ({ to, expects: [], run: () => undefined });

  it('returns the steps between two versions, in order', () => {
    const steps = [stub(3), stub(2), stub(4)];
    expect(plan(1, 4, steps).map((step) => step.to)).toEqual([2, 3, 4]);
  });

  it('has nothing to do for a database that is already current', () => {
    expect(plan(4, 4, [stub(4)])).toEqual([]);
  });

  it('refuses a hole rather than skipping it', () => {
    // The case bildhaft cannot reach with its own table today: a step for the
    // version above the gap exists, so a plan() that skipped would return one
    // step and look like it had done its job.
    const steps = [stub(2), stub(4)];
    expect(() => plan(1, 4, steps)).toThrow(MISSING_STEP);
  });

  it('refuses before any step runs, when the hole is beyond the first', async () => {
    const ran: number[] = [];
    const noting = (to: number): Step => ({ to, expects: [], run: () => void ran.push(to) });
    const steps = [noting(2), noting(3), noting(5)];
    const db = { objectStoreNames: { contains: () => true } };
    await expect(migrate(db as never, {} as never, 1, 5, steps)).rejects.toThrow(MISSING_STEP);
    expect(ran).toEqual([]);
  });
});

describe('a step precondition', () => {
  it('refuses a database missing a store the step expects, without running it', async () => {
    await seedV3();
    const found = await asFound();
    let ran = false;
    const step: Step = {
      to: 4,
      expects: ['collections', 'gibtsnicht'],
      run: () => { ran = true; },
    };

    await expect(migrate(found as never, {} as never, 3, 4, [step]))
      .rejects.toThrow(WRONG_SHAPE);
    expect(ran).toBe(false);
    found.close();
  });
});

describe('isRefusal', () => {
  it('knows its own two errors from everything else', () => {
    expect(isRefusal(new Error(MISSING_STEP))).toBe(true);
    expect(isRefusal(new Error(WRONG_SHAPE))).toBe(true);
    expect(isRefusal(new DOMException('quota', 'QuotaExceededError'))).toBe(false);
    expect(isRefusal('db:no-migration')).toBe(false);
  });
});
