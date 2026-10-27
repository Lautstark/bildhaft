import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';

/**
 * Ordner in a template's group, and „Kopieren …" (her picks, 2026-10-27):
 * „+ Neuer Ordner" makes an empty one whose name is typed in place, the ⋯
 * beside a material's name puts it in one, a material dragged onto another
 * makes an Ordner of the two, and deleting an Ordner leaves its materials
 * loose. An empty Ordner outlives a reload.
 */

const TAFELN = ['Frühstück', 'Mittagessen', 'Abendessen', 'Mit Knete spielen', 'Erster Obstgarten', 'Fische Angeln'];

/** Six Tafeln — past five the sidebar groups by template — from a backup. */
async function seed(page: Page): Promise<void> {
  const now = Date.now();
  const card = (id: string, collectionId: string, word: string) => ({
    id, collectionId, normalizedInput: word.toLowerCase(), rawInput: word, createdAt: now, updatedAt: now,
    slots: [{ id: `${id}-slot`, sourceToken: word, concept: word.toLowerCase(), origin: 'manual', choice: {}, candidates: {} }],
  });
  const backup = {
    format: 'bildhaft.backup', version: 3, exportedAt: new Date(now).toISOString(), notice: '',
    collections: TAFELN.map((name, i) => ({
      id: `t${i}`, name, kind: 'tafel', createdAt: now, updatedAt: now - i * 1000,
      ...(i === 0 ? {
        board: { cols: 2, rows: 1, cells: ['brot', 'kaese'], zones: ['g', 'g'], styles: { g: { fill: '#ef9fb6' } } },
      } : {}),
    })),
    sentences: [card('brot', 't0', 'Brot'), card('kaese', 't0', 'Käse')],
    overrides: [],
  };
  await page.getByRole('complementary').getByRole('button', { name: 'Einstellungen' }).click();
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.keyboard.press('Escape');
  await open(page, 'Frühstück');
}

const side = (page: Page) => page.locator('.sidebar__section--collections');
const row = (page: Page, name: string) => side(page).locator('.collections__item', { hasText: name }).first();
const ordnerRow = (page: Page, name: string) => side(page).locator('.sidebar__ordner', { hasText: name });
const inOrdner = (page: Page, name: string) => ordnerRow(page, name).locator('+ .collections .collections__name');
const loose = (page: Page) => side(page).locator('.sidebar__group-rows > .collections:not(.sidebar__group-rows) .collections__name');

async function open(page: Page, name: string): Promise<void> {
  await row(page, name).click();
  await expect(page.getByLabel('Name des Materials')).toHaveValue(name);
}

async function materialMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Aktionen für dieses Material' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  await seed(page);
});

test('„+ Neuer Ordner" makes an empty one, named in place, and it stays after a reload', async ({ page }) => {
  await side(page).getByRole('button', { name: '+ Neuer Ordner' }).click();
  const name = side(page).getByLabel('Name des Ordners');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Neuer Ordner');
  await name.fill('Arztbesuch');
  await name.press('Enter');

  await expect(ordnerRow(page, 'Arztbesuch')).toBeVisible();
  await expect(ordnerRow(page, 'Arztbesuch').locator('.sidebar__count')).toHaveText('0');

  await page.reload();
  await expect(ordnerRow(page, 'Arztbesuch')).toBeVisible();
});

test('the ⋯ beside a name puts it in an Ordner, made right there or chosen', async ({ page }) => {
  await materialMenu(page, 'In Ordner legen …');
  const sheet = page.getByRole('dialog', { name: 'In Ordner legen' });
  await expect(sheet.getByRole('radio', { name: /Kein Ordner/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: '+ Neuer Ordner' }).click();
  await sheet.getByLabel('Name des Ordners').fill('Mahlzeiten');
  await sheet.getByLabel('Name des Ordners').press('Enter');
  await expect(sheet.getByRole('radio', { name: /Mahlzeiten/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Fertig' }).click();

  await expect(inOrdner(page, 'Mahlzeiten')).toHaveText(['Frühstück']);
  await expect(page.locator('.headnote, .collection-head')).toBeVisible();

  await open(page, 'Mittagessen');
  await materialMenu(page, 'In Ordner legen …');
  await page.getByRole('dialog').getByRole('radio', { name: /Mahlzeiten/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();
  await expect(inOrdner(page, 'Mahlzeiten')).toHaveCount(2);
  await expect(loose(page)).not.toContainText(['Mittagessen']);
});

test('a material dragged onto another makes an Ordner of the two, onto an Ordner goes in, onto „Tafeln" comes out', async ({ page }) => {
  await row(page, 'Mittagessen').dragTo(row(page, 'Frühstück'));
  const name = side(page).getByLabel('Name des Ordners');
  await expect(name).toBeFocused();
  await name.fill('Mahlzeiten');
  await name.press('Enter');
  // Newest first, and the two were written a moment apart: either order.
  await expect(inOrdner(page, 'Mahlzeiten')).toHaveCount(2);
  expect((await inOrdner(page, 'Mahlzeiten').allTextContents()).sort()).toEqual(['Frühstück', 'Mittagessen']);

  await row(page, 'Abendessen').dragTo(ordnerRow(page, 'Mahlzeiten'));
  await expect(ordnerRow(page, 'Mahlzeiten').locator('.sidebar__count')).toHaveText('3');

  await row(page, 'Mittagessen').dragTo(side(page).locator('[data-drop-kind="tafel"]'));
  await expect(ordnerRow(page, 'Mahlzeiten').locator('.sidebar__count')).toHaveText('2');
  await expect(loose(page)).toContainText(['Mittagessen']);
});

test('deleting an Ordner leaves what was in it loose', async ({ page }) => {
  await row(page, 'Mittagessen').dragTo(row(page, 'Frühstück'));
  await side(page).getByLabel('Name des Ordners').fill('Mahlzeiten');
  await side(page).getByLabel('Name des Ordners').press('Enter');

  await ordnerRow(page, 'Mahlzeiten').hover();
  await ordnerRow(page, 'Mahlzeiten').getByRole('button', { name: 'Aktionen für den Ordner „Mahlzeiten“' }).click();
  await page.getByRole('menuitem', { name: 'Ordner löschen' }).click();

  await expect(ordnerRow(page, 'Mahlzeiten')).toHaveCount(0);
  // Loose again, all six (in the sidebar's order, newest first).
  expect((await loose(page).allTextContents()).sort()).toEqual([...TAFELN].sort());
});

test('„Kopieren …" with only the look: a new Tafel beside it, same grid and groups, every field free', async ({ page }) => {
  await materialMenu(page, 'In Ordner legen …');
  await page.getByRole('dialog').getByRole('button', { name: '+ Neuer Ordner' }).click();
  await page.getByRole('dialog').getByLabel('Name des Ordners').fill('Rollenspiel');
  await page.getByRole('dialog').getByLabel('Name des Ordners').press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();

  await materialMenu(page, 'Kopieren …');
  const sheet = page.getByRole('dialog', { name: 'Kopieren' });
  const name = sheet.getByLabel('Name');
  await expect(name).toHaveValue('Frühstück (Kopie)');
  await expect(name).toBeFocused();
  await name.fill('Ärztin');
  await sheet.getByRole('radio', { name: /Nur das Aussehen/ }).click();
  await sheet.getByRole('button', { name: 'Kopieren', exact: true }).click();

  await expect(page.getByLabel('Name des Materials')).toHaveValue('Ärztin');
  await expect(inOrdner(page, 'Rollenspiel')).toHaveCount(2);
  await expect(inOrdner(page, 'Rollenspiel').first()).toHaveText('Ärztin');
  // The grid came along, with its group, and no card.
  await expect(page.locator('.board .cell')).toHaveCount(2);
  await expect(page.locator('.board .cell--free')).toHaveCount(2);
  await expect(page.locator('.board .word__name')).toHaveCount(0);
});

test('„Kopieren …" with everything brings the cards along', async ({ page }) => {
  await materialMenu(page, 'Kopieren …');
  await page.getByRole('dialog', { name: 'Kopieren' }).getByRole('button', { name: 'Kopieren', exact: true }).click();
  await expect(page.getByLabel('Name des Materials')).toHaveValue('Frühstück (Kopie)');
  await expect(page.locator('.board .word__name')).toHaveText(['Brot', 'Käse']);
});
