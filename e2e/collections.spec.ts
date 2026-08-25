import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';

/*
 * Making a Sammlung, and what the page does with the name it just invented.
 *
 * conventions.md §1.5: a new Sammlung is named for the day, and the field is
 * focused *and selected*, so the first keystroke replaces the date. The
 * selecting is the half that section calls easy to leave out, and it was left
 * out here — the name was invented and then left as a chore to delete.
 *
 * Worth saying why this file exists rather than an assertion added to an
 * existing one: creating a Sammlung had no coverage in this product at all.
 * And the two siblings that do have it assert `toBeFocused()` and stop, which
 * is exactly the test that passes against the bug this is about. Focus without
 * selection looks identical to focus with it, until somebody types.
 */

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  // This product opens with the sidebar put away, so the control is behind it.
  await page.getByTitle('Seitenleiste einblenden').click();
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('a new Sammlung is named for the day, and the name is selected', async ({ page }) => {
  const rows = page.locator('.collections__item');
  const before = await rows.count();

  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await expect(rows).toHaveCount(before + 1);

  const title = page.getByLabel('Name der Sammlung');
  await expect(title).toBeFocused();

  // Named for the day: the date is in it, whatever the separator.
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  await expect(title).toHaveValue(
    new RegExp(`${pad(today.getDate())}\\.${pad(today.getMonth() + 1)}\\.${today.getFullYear()}`),
  );

  // And the whole of it is selected — the half that is easy to leave out.
  const selection = await title.evaluate((node: HTMLInputElement) => ({
    start: node.selectionStart, end: node.selectionEnd, length: node.value.length,
  }));
  expect(selection.length).toBeGreaterThan(0);
  expect(selection.start).toBe(0);
  expect(selection.end).toBe(selection.length);
});

test('so the first keystroke replaces the date rather than joining it', async ({ page }) => {
  /* The property the one above is really about, asserted as behaviour. An
     unselected default name is a small chore charged on every creation, and
     what it looks like from the outside is this: you type, and what you get is
     your words stuck onto a date. */
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();

  const title = page.getByLabel('Name der Sammlung');
  await expect(title).toBeFocused();
  await page.keyboard.type('Beim Essen');

  await expect(title).toHaveValue('Beim Essen');
  await expect(page.locator('.collections__name', { hasText: 'Beim Essen' })).toBeVisible();
});
