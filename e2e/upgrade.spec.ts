import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';

/**
 * What a DB_VERSION bump does to a database that is already there — in a real
 * browser, against a real database on disk, which is the only place the
 * versionchange transaction behaves like itself.
 *
 * The carry itself is covered next door, in ownimage.spec.ts: a v3 database
 * with a row in it keeps that row when ownImages arrives. What is here is the
 * other two thirds of adr/0001 — that the page *says* what happened, and that a
 * version it has no step for stops the page and hands over the records rather
 * than starting on top of them.
 */

/** Replaces whatever is there with a database at `version`, built by hand. */
async function seed(
  page: Page, version: number, build: (db: IDBDatabase) => void,
  fill: (db: IDBDatabase) => Promise<void> | void = () => undefined,
): Promise<void> {
  await page.evaluate(async ({ version, source, filler }) => {
    const open = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    open.close();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('bildhaft');
      request.onsuccess = resolve;
      request.onerror = resolve;
    });

    const made = new Function(`return (${source})`)() as (db: IDBDatabase) => void;
    const put = new Function(`return (${filler})`)() as (db: IDBDatabase) => Promise<void>;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft', version);
      request.onupgradeneeded = () => made(request.result);
      request.onsuccess = () => resolve(request.result);
    });
    await put(db);
    db.close();
  }, { version, source: build.toString(), filler: fill.toString() });
}

/** The shape version 1 had: Sitzungen, and sentences keyed to one. */
const asVersion1 = (db: IDBDatabase): void => {
  db.createObjectStore('sessions', { keyPath: 'id' });
  const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
  sentences.createIndex('byNormalized', 'normalizedInput');
  sentences.createIndex('bySession', 'sessionId');
  sentences.createIndex('byUpdated', 'updatedAt');
  const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
  overrides.createIndex('byProvider', 'provider');
  db.createObjectStore('settings');
};

const withOneSitzung = (db: IDBDatabase): Promise<void> =>
  new Promise((resolve) => {
    const tx = db.transaction(['sessions', 'sentences'], 'readwrite');
    tx.objectStore('sessions').put({
      id: 'c1', name: 'Aus Version 1', sentenceIds: ['s1'], createdAt: 1, updatedAt: 1,
    });
    tx.objectStore('sentences').put({
      id: 's1', sessionId: 'c1', rawInput: 'Der Hund liegt unter dem Tisch',
      normalizedInput: 'der hund liegt unter dem tisch', slots: [], createdAt: 1, updatedAt: 1,
    });
    tx.oncomplete = () => resolve();
  });

/** The shape version 3 had: today's, without ownImages. */
const asVersion3 = (db: IDBDatabase): void => {
  db.createObjectStore('collections', { keyPath: 'id' });
  const sentences = db.createObjectStore('sentences', { keyPath: 'id' });
  sentences.createIndex('byNormalized', 'normalizedInput');
  sentences.createIndex('byCollection', 'collectionId');
  sentences.createIndex('byUpdated', 'updatedAt');
  const overrides = db.createObjectStore('overrides', { keyPath: 'key' });
  overrides.createIndex('byProvider', 'provider');
  db.createObjectStore('settings');
};

const withOneSammlung = (db: IDBDatabase): Promise<void> =>
  new Promise((resolve) => {
    const tx = db.transaction('collections', 'readwrite');
    tx.objectStore('collections').put({
      id: 'c1', name: 'Aus Version 3', sentenceIds: [], createdAt: 1, updatedAt: 1,
    });
    tx.oncomplete = () => resolve();
  });

/** What the browser is holding now, without upgrading it. */
const versionOnDisk = (page: Page): Promise<number> =>
  page.evaluate(() => new Promise<number>((resolve) => {
    const request = indexedDB.open('bildhaft');
    request.onsuccess = () => {
      const found = request.result.version;
      request.result.close();
      resolve(found);
    };
  }));

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('says what the upgrade carried across', async ({ page }) => {
  await seed(page, 3, asVersion3, withOneSammlung);
  await page.reload();

  /* The toast, not a banner: this is an outcome rather than a condition, and
   * conventions.md §3.8 puts outcomes in the one region the page already has.
   * The count is the point of the sentence — it is the one number somebody can
   * check against the Sammlungen in front of them. */
  await expect(page.locator('.toast'))
    .toHaveText('Die Datenbank wurde von Version 3 auf 4 gebracht. Eine Sammlung ist mitgekommen.');
  await page.getByRole('button', { name: 'Seitenleiste einblenden' }).click();
  await expect(page.locator('.sidebar__section--collections .collections__item')).toContainText(['Aus Version 3']);
});

test('refuses a version it has no step for, and changes nothing', async ({ page }) => {
  await seed(page, 1, asVersion1, withOneSitzung);
  await page.reload();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Diese Datenbank ist älter');
  // The database is still on 1, with everything in it. Nothing was created, and
  // no empty Sammlung was written on top of it.
  expect(await versionOnDisk(page)).toBe(1);
  // And the one button that would destroy anything cannot be pressed yet.
  await expect(sheet.getByRole('button', { name: /verwerfen/ })).toBeDisabled();

  // Dismissing costs nothing, and the page says so rather than sitting there.
  await sheet.getByRole('button', { name: 'Dialog schließen' }).click();
  await expect(page.locator('#root')).toContainText('Es wurde nichts verändert');
  expect(await versionOnDisk(page)).toBe(1);
});

test('hands the records over as a file before anything is discarded', async ({ page }) => {
  await seed(page, 1, asVersion1, withOneSitzung);
  await page.reload();

  const sheet = page.getByRole('dialog');
  const discard = sheet.getByRole('button', { name: /verwerfen/ });
  await expect(discard).toBeDisabled();

  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Daten als Datei sichern' }).click();
  let raw = '';
  for await (const chunk of await (await download).createReadStream()) raw += chunk;
  // The records this build could not read are in the file, verbatim.
  expect(raw).toContain('Aus Version 1');
  expect(raw).toContain('Der Hund liegt unter dem Tisch');

  // Only now.
  await expect(discard).toBeEnabled();
  await discard.click();

  // A page that starts, on an empty library, at the current version.
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  expect(await versionOnDisk(page)).toBe(4);
  await page.getByRole('button', { name: 'Seitenleiste einblenden' }).click();
  await expect(page.locator('.sidebar__section--collections .collections__item')).toHaveCount(1);
  await expect(page.locator('.sidebar__section--collections .collections__item')).not.toContainText(['Aus Version 1']);
});
