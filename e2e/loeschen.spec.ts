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

test('die Tafel: keine Mülleimer an Spalten und Zeilen, die Größe zieht man im Raster auf, keine Pfeile', async ({ page }) => {
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  const cells = page.locator('.board .cell');
  await expect(cells).toHaveCount(12);
  await expect(page.getByRole('button', { name: /^(Spalte|Zeile) \d+ löschen$/ })).toHaveCount(0);

  // Typed words fill the first free fields; nothing waits under the Tafel, no arrows anywhere.
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Apfel, Banane, Kiwi');
  await bar.press('Enter');
  await expect(page.locator('.board .word__name')).toHaveText(['Apfel', 'Banane', 'Kiwi']);
  await expect(page.locator('.tray')).toHaveCount(0);
  await expect(page.locator('.board-card__move')).toHaveCount(0);

  // The size button opens a raster of at most 10 × 8; pointing says the fields' size on paper.
  const button = page.locator('.board-size .size-pick__button');
  await expect(button).toHaveText('4 × 3 Felder ▾');
  await button.click();
  const pop = page.locator('.size-pick__pop');
  await expect(pop.locator('.size-pick__cell')).toHaveCount(80);
  await pop.getByRole('button', { name: '2 Spalten × 1 Zeilen', exact: true }).hover();
  await expect(pop.locator('.size-pick__say')).toContainText('2 Spalten × 1 Zeilen');
  await expect(pop.locator('.size-pick__say')).toContainText(/Felder auf dem Papier etwa \d+ × \d+ mm/);
  await expect(pop.locator('.size-pick__cell--in')).toHaveCount(2);
  // Smaller than the cards: what has no field waits under the Tafel, and that is said.
  await pop.getByRole('button', { name: '2 Spalten × 1 Zeilen', exact: true }).click();
  await expect(cells).toHaveCount(2);
  await expect(page.locator('.tray .word__name')).toHaveText(['Kiwi']);
  await expect(page.locator('.tray')).toContainText('Passt nicht mehr auf die Tafel');
  await expect(page.getByText('1 Karte passt nicht mehr auf die Tafel und liegt darunter.')).toBeVisible();
  // Bigger again, from the keyboard: the arrows walk the size, Enter takes it.
  await button.click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(cells).toHaveCount(3);
});
