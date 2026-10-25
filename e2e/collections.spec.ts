import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { pickTemplate } from './helpers.ts';

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
  /* The sidebar is open on arrival. An absent preference has always meant open
     in this product, and since conventions.md §6.3 called `defaultSettings()`'s
     stored `false` a bug rather than a difference, the stored default says the
     same — so there is nothing to reveal and the reveal does not render. */
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('a new Sammlung is named for the day, and the caret is in its box', async ({ page }) => {
  const rows = page.locator('.sidebar__section--collections .collections__item');
  const before = await rows.count();

  await page.getByRole('button', { name: '+ Neues Material' }).click();
  /* The untouched day-one material is reused, not doubled: the row count
     stays, and the choice of template opens on it (2026-10-25). */
  await expect(rows).toHaveCount(before);
  // Named once its template is chosen: the choice comes first, on its own.
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Satzstreifen/);

  // Named for the day: the date is in it, whatever the separator.
  const title = page.getByLabel('Name des Materials');
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  await expect(title).toHaveValue(
    new RegExp(`${pad(today.getDate())}\\.${pad(today.getMonth() + 1)}\\.${today.getFullYear()}`),
  );

  // What is made is the material, so typing starts there and not in its name
  // (her ask, 2026-10-22): the first keystroke is the first sentence.
  await expect(page.getByLabel('Satz eingeben')).toBeFocused();
  await page.keyboard.type('Wir gehen raus');
  await expect(page.getByLabel('Satz eingeben')).toHaveValue('Wir gehen raus');
  await expect(title).not.toHaveValue('Wir gehen raus');
});
