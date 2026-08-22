import { expect, test } from '@playwright/test';
import { idForTerm, labelsForTerm, mockArasaac, readSentences } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('turns a sentence into symbols and drops function words', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  // "einen" is an article and must not get a slot of its own.
  await expect(page.locator('.row').first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'Apfel', 'essen']);

  const images = page.locator('.row .slot img');
  await expect(images).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect
      .poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }
});

test('reassembles a separable verb into one slot', async ({ page }) => {
  await translate(page, 'Räum bitte dein Zimmer auf');

  const [row] = await readSentences(page);
  const separable = row.slots.find((s) => s.origin === 'separable');
  expect(separable?.concept).toBe('aufräumen');
  // The trailing particle must not also appear as its own slot.
  expect(row.slots.map((s) => s.sourceToken)).not.toContain('auf');
});

test('never silently drops a word it cannot match', async ({ page }) => {
  await mockArasaac(page, { emptyFor: ['xylo'] });
  await page.goto('/');
  await translate(page, 'Ich mag Xylowurst');

  const [row] = await readSentences(page);
  const unmatched = row.slots.find((s) => s.sourceToken === 'Xylowurst');
  expect(unmatched).toBeDefined();
  expect(unmatched?.chosen).toBeNull();
});

test('remembers a correction and applies it to later sentences', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  // Correct "Apfel" to the second offered symbol.
  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  const alternative = labelsForTerm('Apfel')[1];
  await page.locator('.picker__item', { hasText: alternative }).first().click();
  await expect(page.locator('.dialog')).toBeHidden();

  const expectedId = String(idForTerm('Apfel') + 1);
  await expect.poll(async () => {
    const rows = await readSentences(page);
    return rows[0].slots.find((s) => s.sourceToken === 'Apfel')?.chosen;
  }).toBe(expectedId);

  // The personal dictionary should now win for a brand new sentence.
  await translate(page, 'Der Apfel ist rot');

  await expect.poll(async () => {
    const rows = await readSentences(page);
    const slot = rows[1].slots.find((s) => s.sourceToken === 'Apfel');
    return `${slot?.origin}:${slot?.chosen}`;
  }).toBe(`override:${expectedId}`);
});

test('supports adding, removing and reordering slots', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const row = page.locator('.row').first();

  // Add a slot from the picker's own search.
  await row.locator('.slot-add').click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.locator('.picker__item', { hasText: 'Banane' }).first().click();
  await expect(row.locator('.slot')).toHaveCount(5);
  await expect(row.locator('.slot__label').last()).toHaveText('Banane');

  // Reorder with the keyboard; drag is covered separately by the mouse test.
  await row.locator('.slot').first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(row.locator('.slot__label')).toHaveText(['möchte', 'Ich', 'Apfel', 'essen', 'Banane']);

  // Removing a slot removes the whole field, not just its symbol.
  await row.locator('.slot', { hasText: 'Banane' }).click();
  await page.getByRole('button', { name: 'Feld entfernen' }).click();
  await expect(row.locator('.slot')).toHaveCount(4);
});

test('reorders slots by dragging', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const row = page.locator('.row').first();

  await row.locator('.slot').nth(3).dragTo(row.locator('.slot').nth(0));
  await expect(row.locator('.slot__label')).toHaveText(['essen', 'Ich', 'möchte', 'Apfel']);
});

test('keeps the collection after a reload', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await page.reload();

  await expect(page.locator('.row')).toHaveCount(1);
  await expect(page.locator('.row').first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'Apfel', 'essen']);
});

test('offers a previous translation of the same line', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  // Punctuation and casing must not defeat the lookup.
  await page.getByLabel('Satz eingeben').fill('ich möchte einen apfel essen.');
  await expect(page.locator('.composer__reuse')).toContainText('schon übersetzt');
});

test('shows a retry affordance instead of an endless spinner', async ({ page }) => {
  await mockArasaac(page, { failImages: true });
  await page.goto('/');
  await translate(page, 'Ich möchte einen Apfel essen');

  // The failure must resolve to a visible error state, never a permanent spinner.
  await expect(page.locator('.slot__blank--error').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.slot__blank .spinner')).toHaveCount(0);
});
