import { expect, test } from '@playwright/test';
import { idForTerm, labelsForTerm, mockArasaac, readSentences } from './arasaac-mock.ts';
import { translate, translateAll } from './helpers.ts';

/**
 * The words under a symbol.
 *
 * A slot's word is the one the sentence used, and that word is also the key a
 * correction is remembered under. These tests are about the two staying apart:
 * what a card says can be rewritten without the app forgetting what it learned.
 */

const caption = (page: import('@playwright/test').Page) =>
  page.getByLabel('Text unter dem Symbol');

const rowLabels = (page: import('@playwright/test').Page) =>
  page.locator('.row').first().locator('.slot__label');

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('prints a rewritten caption, and keeps it across a reload', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  // Empty means unchanged, so the field shows the word only as a placeholder.
  await expect(caption(page)).toHaveValue('');
  await expect(caption(page)).toHaveAttribute('placeholder', 'Apfel');
  await caption(page).fill('der Apfel');
  await page.getByRole('button', { name: 'Fertig' }).click();

  await expect(rowLabels(page)).toHaveText(['Ich', 'möchte', 'der Apfel', 'essen']);

  await page.reload();
  await expect(rowLabels(page)).toHaveText(['Ich', 'möchte', 'der Apfel', 'essen']);

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect(page.locator('.preview-frame .ps-card__label')).toContainText(['der Apfel']);
});

test('survives being settled by picking a symbol in the same breath', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  await caption(page).fill('der Apfel');
  // No pause: the pick closes the dialog while the typing is still on its way.
  await page.locator('.picker__item', { hasText: labelsForTerm('Apfel')[1] }).first().click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);

  await expect(rowLabels(page)).toHaveText(['Ich', 'möchte', 'der Apfel', 'essen']);

  // The correction is still remembered under the word the sentence used, not
  // under the new wording — so a later sentence saying "Apfel" inherits it.
  await translate(page, 'Der Apfel ist rot');
  await expect.poll(async () => {
    const rows = await readSentences(page);
    const slot = rows[1].slots.find((s) => s.sourceToken === 'Apfel');
    return `${slot?.origin}:${slot?.chosen}`;
  }).toBe(`override:${String(idForTerm('Apfel') + 1)}`);
});

test('clearing the field gives the word back', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  const slot = page.locator('.row').first().locator('.slot', { hasText: 'Apfel' });
  await slot.click();
  await caption(page).fill('der Apfel');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(rowLabels(page).nth(2)).toHaveText('der Apfel');

  await page.locator('.row').first().locator('.slot').nth(2).click();
  await expect(caption(page)).toHaveValue('der Apfel');
  await caption(page).fill('');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(rowLabels(page).nth(2)).toHaveText('Apfel');
});

test('a card sheet keeps one card per wording, not per symbol', async ({ page }) => {
  await translateAll(page, ['Ich möchte einen Apfel essen', 'Der Apfel ist rot']);

  // Same symbol in both sentences; only the second one gets rewritten.
  await page.locator('.row', { hasText: 'Der Apfel ist rot' })
    .locator('.slot', { hasText: 'Apfel' }).first().click();
  await caption(page).fill('der Apfel');
  await page.getByRole('button', { name: 'Fertig' }).click();

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await page.getByRole('button', { name: 'Kartenblatt' }).click();

  const labels = await page.locator('.preview-frame .ps-card__label').allTextContents();
  expect(labels).toContain('Apfel');
  expect(labels).toContain('der Apfel');
});

/*
 * Enter in the picker. It is what a person reaches for after typing a caption,
 * and the dialog has no form of its own to give it a meaning.
 */
test('Enter is Fertig, and keeps what was typed', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  await caption(page).fill('der Apfel');
  await caption(page).press('Enter');

  await expect(page.locator('dialog.sheet')).toHaveCount(0);
  await expect(rowLabels(page).nth(2)).toHaveText('der Apfel');
});

test('Enter in the search field searches instead of closing', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.getByLabel('Symbol suchen').press('Enter');

  await expect(page.locator('dialog.sheet')).toHaveCount(1);
  await expect(page.locator('.picker__item', { hasText: 'Banane' }).first()).toBeVisible();
});

test('Enter on a symbol picks it rather than closing the field unchanged', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  const alternative = labelsForTerm('Apfel')[1];
  await page.locator('.picker__item', { hasText: alternative }).first().focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('dialog.sheet')).toHaveCount(0);
  await expect.poll(async () => {
    const rows = await readSentences(page);
    return rows[0].slots.find((s) => s.sourceToken === 'Apfel')?.chosen;
  }).toBe(String(idForTerm('Apfel') + 1));
});
