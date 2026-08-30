import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { rowFor, translate } from './helpers.ts';

/**
 * A picture of the user's own, in place of a symbol.
 *
 * The point of these is that bildhaft holds the bytes. A symbol folder can only
 * promise a path, and a path stops being true the moment a file is moved; a
 * photo of a particular child is exactly the case where that would hurt most.
 * So the tests here are about the picture surviving things — a reload, a source
 * switch, a round trip through a backup file.
 */

/** 3x3 green, told apart from the 1x1 ARASAAC mock by its width alone. */
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAD0lEQVR4nGNg+M8ARVhYAIaXCPjDmz7KAAAAAElFTkSuQmCC';

async function attachPhoto(page: Page, name = 'Bente.png'): Promise<void> {
  await page.locator('.picker__own input[type=file]').setInputFiles({
    name, mimeType: 'image/png', buffer: Buffer.from(PHOTO, 'base64'),
  });
}

/** The width of each symbol in the first row; 3 marks an own picture. */
async function widths(page: Page): Promise<number[]> {
  return page.locator('.row').first().locator('.slot img')
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
}

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('puts an own picture in a slot, and keeps it across a reload', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await page.locator('.row').first().locator('.slot').nth(2).click();
  await attachPhoto(page);

  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);

  // Stored, not referenced: nothing here points at the file it came from.
  await page.reload();
  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);
});

/**
 * Opening a field that has a picture in it shows the picture.
 *
 * It did not, and the gap was invisible from the code: the dialog knew there was
 * one — it offered to remove it — but drew nothing of it. Nothing in it is
 * marked while an own picture is up either, by design, because the suggestions
 * below are what the field would fall back to and not what it holds. So opening
 * a field that had a photograph in it presented a search for a word, a grid of
 * pictograms, and the photograph nowhere: it read as having lost it.
 */
test('the picker shows the picture the field is already holding', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const slot = page.locator('.row').first().locator('.slot').nth(2);
  await slot.click();
  await attachPhoto(page);
  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);

  await slot.click();
  await expect(page.locator('.picker__grid')).toBeVisible();

  /*
   * The picture itself, not a placeholder: 3 is the fixture and 1 is the
   * ARASAAC mock, so the width says which of them arrived. Beside the buttons
   * that change it, because keep, replace and remove are one decision and it
   * needs the picture in front of it.
   */
  const shown = page.locator('.picker__own img');
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveJSProperty('naturalWidth', 3);

  // And nowhere when there is nothing to show: the field two along has only a
  // symbol, and a preview box standing empty would say it had a picture.
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await page.locator('.row').first().locator('.slot').nth(1).click();
  await expect(page.locator('.picker__grid')).toBeVisible();
  await expect(page.locator('.picker__own img')).toHaveCount(0);
});

test('leaves the symbol underneath, and uncovers it again on removal', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const slot = page.locator('.row').first().locator('.slot').nth(2);
  await slot.click();
  await attachPhoto(page);
  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);

  await slot.click();
  await page.getByRole('button', { name: 'Eigenes Bild entfernen' }).click();
  // The ARASAAC symbol was never discarded, so the slot is not left empty.
  await expect.poll(() => widths(page)).toEqual([1, 1, 1, 1]);
  await expect(page.locator('.row').first().locator('.slot__label').nth(2)).toHaveText('Apfel');
});

test('carries own pictures through a backup and back', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await page.locator('.row').first().locator('.slot').nth(2).click();
  await attachPhoto(page);
  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  await page.getByRole('menuitem', { name: 'Sammlung exportieren' }).click();
  const path = await (await download).path();

  const raw = await page.evaluate(async () => {
    const app = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<unknown[]>((resolve) => {
      const query = app.transaction('ownImages').objectStore('ownImages').getAll();
      query.onsuccess = () => resolve(query.result);
    });
  });
  expect(raw).toHaveLength(1);

  // Import the file back: it must arrive as a second collection with the picture.
  // Reading a file lives in Einstellungen → Sicherung, beside the button that makes
  // one — it used to be a „Importieren" button in the sidebar, a screen away
  // from its own other half.
  const show = page.getByRole('button', { name: 'Seitenleiste einblenden' });
  if (await show.count()) await show.click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.locator('.panel', { hasText: 'Sicherung' }).locator('summary').click();
  await page.locator('.panel', { hasText: 'Sicherung' }).locator('input[type=file]')
    .setInputFiles(path!);
  // The dialog closes itself on a read, so the list is visible again.
  await expect(page.locator('.collections__item')).toHaveCount(2);
  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);
});

test('writes no symbol pixels into a file, only the user’s own', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  const plain = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  await page.getByRole('menuitem', { name: 'Sammlung exportieren' }).click();
  let raw = '';
  for await (const chunk of await (await plain).createReadStream()) raw += chunk;
  // No own pictures in play: the file is references only, exactly as before.
  expect(raw).not.toMatch(/data:image|base64/);

  await page.locator('.row').first().locator('.slot').nth(2).click();
  await attachPhoto(page);
  await expect.poll(() => widths(page)).toEqual([1, 1, 3, 1]);

  const withPhoto = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  await page.getByRole('menuitem', { name: 'Sammlung exportieren' }).click();
  let second = '';
  for await (const chunk of await (await withPhoto).createReadStream()) second += chunk;

  const data = JSON.parse(second);
  // Exactly one picture travels, and it is the one the user supplied. The
  // licensing guarantee is unchanged: no ARASAAC or METACOM pixel is written.
  expect(data.ownImages).toHaveLength(1);
  expect(second.match(/data:image/g)).toHaveLength(1);
});

test('adding the store keeps a database that was already there', async ({ page }) => {
  /*
   * ownImages arrives in v4, and an upgrade used to drop every store and start
   * empty. That was defensible when the data behind it was already unreachable.
   * It is not defensible for adding a feature to a library someone has been
   * filling for weeks, and the failure would be silent and total.
   *
   * So: build a v3 database by hand, with a row in it, and open the app on it.
   */
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('bildhaft');
      request.onsuccess = resolve;
      request.onerror = resolve;
    });

    const old = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft', 3);
      request.onupgradeneeded = () => {
        const created = request.result;
        created.createObjectStore('collections', { keyPath: 'id' });
        const sentences = created.createObjectStore('sentences', { keyPath: 'id' });
        sentences.createIndex('byNormalized', 'normalizedInput');
        sentences.createIndex('byCollection', 'collectionId');
        sentences.createIndex('byUpdated', 'updatedAt');
        const overrides = created.createObjectStore('overrides', { keyPath: 'key' });
        overrides.createIndex('byProvider', 'provider');
        created.createObjectStore('settings');
      };
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise((resolve) => {
      const tx = old.transaction(['collections', 'sentences'], 'readwrite');
      tx.objectStore('collections').put({
        id: 'c1', name: 'Aus Version 3', sentenceIds: ['s1'], createdAt: 1, updatedAt: 1,
      });
      tx.objectStore('sentences').put({
        id: 's1', collectionId: 'c1', rawInput: 'Der Hund liegt unter dem Tisch',
        normalizedInput: 'der hund liegt unter dem tisch', slots: [], createdAt: 1, updatedAt: 1,
      });
      tx.oncomplete = resolve;
    });
    old.close();
  });

  await page.reload();
  await page.getByRole('button', { name: 'Seitenleiste einblenden' }).click();
  await expect(page.locator('.collections__item')).toContainText(['Aus Version 3']);
  await expect(rowFor(page, 'Der Hund liegt unter dem Tisch')).toHaveCount(1);
});
