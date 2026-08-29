import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { chooseFakeFolder, openSymbolSettings, withoutDirectoryPicker } from './metacom-folder.ts';

/**
 * The line under the input, which names the source the rows are drawn from.
 *
 * It says *whose* answer that is, and the reason is that a line naming a source
 * without saying which of the two it read is a line that is right by luck.
 *
 * It used to carry an „Ändern" button as well, leading to this Sammlung's
 * sheet or to the settings card depending on where the next sentence landed.
 * That went on 2026-08-29: the line states and nothing more, and each of the
 * two answers has one door - a Sammlung's is its ⋯, the default is the
 * settings card.
 *
 * These assertions are about the words rather than about the pictures on
 * purpose. What is on the page and what the page says about it are two things
 * that can disagree, and this line is the one that would be wrong silently —
 * the symbols would still be right.
 */

const line = (page: Page) => page.locator('.composer__provider');

test.beforeEach(async ({ page }) => {
  await withoutDirectoryPicker(page);
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('names the default while the Sammlung is following it', async ({ page }) => {
  await expect(line(page)).toContainText('Symbole (Standard):');
  await expect(line(page)).toContainText('ARASAAC');
});

test('names the Sammlung once the Sammlung has answered', async ({ page }) => {
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  await page.getByRole('menuitem', { name: 'Einstellungen dieser Sammlung …' }).click();
  await page.locator('.source[data-choice="arasaac"]').click();
  await page.locator('.sheet .foot').getByRole('button', { name: 'Fertig' }).click();

  // The same source, and a different sentence about it: ARASAAC is this
  // Sammlung's answer now rather than the default's, so the default can move
  // without moving it — and the line has to be the thing that says so.
  await expect(line(page)).toContainText('Symbole dieser Sammlung:');
  await expect(line(page)).toContainText('ARASAAC');
});

test('follows the source into the Sammlung it belongs to', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  // Adopting moved the default, and this Sammlung follows it.
  await expect(line(page)).toContainText('Symbole (Standard):');
  await expect(line(page)).toContainText('METACOM');
});

test('says a source that cannot draw is not ready', async ({ page }) => {
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  await page.getByRole('menuitem', { name: 'Einstellungen dieser Sammlung …' }).click();
  // METACOM is not offered in the sheet without a folder, so the state has to
  // arrive the way it really does: from storage, as a restored Sicherung does.
  await page.locator('.sheet .foot').getByRole('button', { name: 'Fertig' }).click();
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction('collections', 'readwrite');
      const store = tx.objectStore('collections');
      const all = store.getAll();
      all.onsuccess = () => {
        for (const one of all.result) store.put({ ...one, provider: 'metacom' });
      };
      tx.oncomplete = resolve;
    });
  });
  await page.reload();

  await expect(line(page)).toContainText('Symbole dieser Sammlung:');
  await expect(line(page)).toContainText('METACOM (nicht bereit)');
  // And the page does not quietly draw ARASAAC instead.
  await expect(page.locator('.banner')).toContainText('kein METACOM-Ordner eingerichtet');
});

test('the line states and does not route', async ({ page }) => {
  // It carried an „Ändern" button whose destination changed with where the next
  // sentence would land, and the caption was what made that honest. Both halves
  // of that arrangement are gone: there is nothing pressable in the line.
  await expect(line(page).getByRole('button')).toHaveCount(0);

  // The one door is the ⋯ beside the name, and it opens the Sammlung's sheet.
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  await page.getByRole('menuitem', { name: 'Einstellungen dieser Sammlung …' }).click();
  await expect(page.getByRole('heading', { name: 'Symbolquelle' })).toBeVisible();
});
