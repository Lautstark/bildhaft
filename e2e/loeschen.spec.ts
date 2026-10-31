import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { pickTemplate, translate } from './helpers.ts';

/**
 * Löschen, everywhere the same (her pick „A, Mülleimer rechts", 2026-10-31):
 * the bin that takes out a whole thing stands at the thing's edge — right
 * of a row, a Strophe, a page, a Schritt, a Streifen; over a column — never
 * on a card. It shows while the pointer is in the thing, and pointed at, the
 * thing is outlined whole. A card's own bin is the same trash sign, small,
 * the × left for closing.
 */
test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

const DANGER = 'rgb(163, 40, 35)';

test('ein Streifen hat seinen Mülleimer rechts daneben, und zeigt beim Zeigen, was weggeht', async ({ page }) => {
  await translate(page, 'Ich esse einen Apfel');
  const row = page.locator('.row').first();
  const bin = row.getByRole('button', { name: 'Diese Zeile löschen' });
  await row.hover();
  await expect(bin.locator('..')).toHaveCSS('opacity', '1');
  const rowBox = (await row.boundingBox())!;
  expect((await bin.boundingBox())!.x).toBeGreaterThanOrEqual(rowBox.x + rowBox.width);
  await bin.hover();
  await expect(row).toHaveCSS('outline-color', DANGER);
  await bin.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.locator('.row')).toHaveCount(0);
});

test('die Karte hat den Mülleimer statt des ×', async ({ page }) => {
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await pickTemplate(page, /^Wortkarten/);
  await page.getByLabel('Wörter hinzufügen').fill('Apfel');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  const drop = page.locator('.word__drop').first();
  await expect(drop).toHaveAttribute('aria-label', /löschen/);
  await expect(drop.locator('svg')).toHaveCount(1);
  await expect(drop).not.toHaveText('×');
});

test('die Tafel: Mülleimer über jeder Spalte und rechts jeder Zeile, „+ Spalte" und „+ Zeile" statt der Zähler', async ({ page }) => {
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  const cells = page.locator('.board .cell');
  await expect(cells).toHaveCount(12);
  await page.getByRole('button', { name: 'Neue Karte in Feld 1', exact: true }).click();
  const line = page.getByLabel('Wort für Feld 1', { exact: true });
  await line.fill('Apfel, Banane, Kiwi');
  await line.press('Enter');
  await expect(page.locator('.board .word__name')).toHaveText(['Apfel', 'Banane', 'Kiwi']);

  // The column's bin stands just over it; the row's right of the grid.
  const edge = page.locator('.board-edge');
  const spalte2 = edge.getByRole('button', { name: 'Spalte 2 löschen', exact: true });
  await cells.nth(1).hover();
  await expect(spalte2.locator('..')).toHaveCSS('opacity', '1');
  const field = (await cells.nth(1).boundingBox())!;
  const binBox = (await spalte2.boundingBox())!;
  expect(binBox.y + binBox.height).toBeLessThanOrEqual(field.y);
  expect(binBox.x).toBeGreaterThan(field.x);
  expect(binBox.x + binBox.width).toBeLessThan(field.x + field.width);
  const zeile1 = edge.getByRole('button', { name: 'Zeile 1 löschen', exact: true });
  const grid = (await page.locator('.board').boundingBox())!;
  expect((await zeile1.boundingBox())!.x).toBeGreaterThanOrEqual(grid.x + grid.width);

  // Pointed at, one frame goes round the whole column.
  await spalte2.hover();
  const frame = edge.locator('.board-edge__frame');
  await expect(frame).toHaveCount(1);
  const box = (await frame.boundingBox())!;
  expect(box.height).toBeGreaterThan(field.height * 2.5);

  // A column with a card in it is asked about; its card goes back to the tray.
  await spalte2.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(cells).toHaveCount(9);
  await expect(page.locator('.board .word__name')).toHaveText(['Apfel', 'Kiwi']);
  await expect(page.locator('.tray .word__name')).toHaveText(['Banane']);
  await expect(page.getByText('1 Karte liegt wieder unter „Noch nicht auf der Tafel“.')).toBeVisible();

  // „+ Spalte" and „+ Zeile" grow it at the end; an empty, bare line goes without asking.
  await edge.getByRole('button', { name: '+ Spalte' }).click();
  await expect(cells).toHaveCount(12);
  await page.locator('.board-edge__more').getByRole('button', { name: '+ Zeile' }).click();
  await expect(cells).toHaveCount(16);
  await edge.getByRole('button', { name: 'Zeile 4 löschen', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cells).toHaveCount(12);
});
