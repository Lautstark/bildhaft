import { expect, test } from '@playwright/test';
import { mockArasaac, readSentences } from './arasaac-mock.ts';
import { rowFor, translate, translateAll } from './helpers.ts';

/**
 * What a row is called.
 *
 * A row is not always a sentence. Typing „waschen, einseifen, abtrocknen" is a
 * way of searching for three symbols to stand in a row, and the row wants to be
 * called „Hände waschen". These tests are about those two staying apart: the
 * name can be anything without the words that fetched the symbols being lost,
 * and a search finds the row by either.
 *
 * The name is typed into the line at the head of the row, the way a Sammlung's
 * is, and bound by the same @lautstark/design/rename. So the two timing tests
 * further down are about that binding surviving inside something the app
 * repaints — which the work head, holding one field, never had to.
 */

const row = (page: import('@playwright/test').Page) => page.locator('.row').first();
const name = (page: import('@playwright/test').Page) => page.getByLabel('Name der Zeile').first();

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('names a row, prints the name, and keeps it across a reload', async ({ page }) => {
  await translate(page, 'waschen einseifen abtrocknen');

  // Empty means unnamed, so the field shows the typed line only as a hint.
  await expect(name(page)).toHaveValue('');
  await expect(name(page)).toHaveAttribute('placeholder', 'waschen einseifen abtrocknen');

  await name(page).fill('Hände waschen');
  await name(page).press('Enter');

  await expect(name(page)).toHaveValue('Hände waschen');
  // The typed words are still there to be seen, just not in the way.
  await expect(name(page)).toHaveAttribute('title', 'Getippt: „waschen einseifen abtrocknen“');

  await page.reload();
  await expect(name(page)).toHaveValue('Hände waschen');

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect(page.locator('.preview-frame .ps-caption')).toHaveText(['Hände waschen']);
});

test('leaves the symbols and their words alone', async ({ page }) => {
  await translate(page, 'waschen einseifen abtrocknen');
  const labels = row(page).locator('.slot__label');
  const before = await labels.allTextContents();

  await name(page).fill('Hände waschen');
  await name(page).press('Enter');

  await expect(name(page)).toHaveValue('Hände waschen');
  await expect(labels).toHaveText(before);
});

test('clearing the field gives the typed line back', async ({ page }) => {
  await translate(page, 'waschen einseifen abtrocknen');

  await name(page).fill('Hände waschen');
  await name(page).press('Enter');
  await expect(name(page)).toHaveValue('Hände waschen');

  await name(page).fill('');
  await name(page).press('Enter');

  // Stored as absent, so "never named" and "name cleared" stay one state.
  await expect.poll(async () => (await readSentences(page))[0]?.title).toBeFalsy();

  await page.reload();
  await expect(name(page)).toHaveValue('');
  await expect(name(page)).toHaveAttribute('placeholder', 'waschen einseifen abtrocknen');
  await expect(name(page)).not.toHaveAttribute('title', /.+/);
});

/*
 * The reason this field is bound rather than hand-rolled, and the reason a
 * renamed row is taken rather than rebuilt.
 *
 * The write lands 400 ms after a keystroke, which is to say in the middle of
 * somebody typing. A repaint that rebuilt the row would replace the field they
 * are typing in: the caret goes, and so does everything typed after the write.
 *
 * Waits for the write rather than for a duration. A sleep long enough to cover
 * the debounce on an idle machine is not long enough on a loaded one, and this
 * test failed exactly that way inside the full suite while passing alone —
 * whereas the stored name reaching the database *is* the moment under test.
 */
test('a write that lands mid-typing does not take the field away', async ({ page }) => {
  await translate(page, 'waschen einseifen abtrocknen');

  await name(page).click();
  await name(page).pressSequentially('Hände');
  await expect.poll(async () => (await readSentences(page))[0]?.title).toBe('Hände');
  await name(page).pressSequentially(' waschen');

  await expect(name(page)).toBeFocused();
  await expect(name(page)).toHaveValue('Hände waschen');

  await name(page).blur();
  // The same wait as above, for the same reason, on the write blur commits.
  // A reload issued before it has reached the database reads back the value
  // from the debounced write instead - "Hände" - and reads as this test's
  // subject failing when what actually happened is that the page was reloaded
  // mid-write. It was the one race the polling above did not cover.
  await expect.poll(async () => (await readSentences(page))[0]?.title).toBe('Hände waschen');
  await page.reload();
  await expect(name(page)).toHaveValue('Hände waschen');
});

/* Tabbing through a row is not renaming it. A field that wrote on every blur
   would touch the record each time somebody passed through it, and a touch is
   what a standing backup listens for. */
test('a name that was not touched is not written again', async ({ page }) => {
  await translate(page, 'waschen einseifen abtrocknen');
  const before = (await readSentences(page))[0]?.updatedAt;

  await name(page).click();
  await name(page).blur();
  // A duration, because the thing being asserted is that nothing happens. Well
  // clear of the 400 ms debounce, so a loaded machine cannot pass it by being
  // slow rather than by being right.
  await page.waitForTimeout(1500);

  expect((await readSentences(page))[0]?.updatedAt).toBe(before);
});

/*
 * The search has to answer to both. The name is how the row is thought of now;
 * the typed words are what would otherwise become unfindable the moment it was
 * named — which is the whole reason they were kept.
 */
test('the search finds a named row by its name and by what was typed', async ({ page }) => {
  await translateAll(page, ['waschen einseifen abtrocknen', 'Der Hund schläft']);

  const washing = rowFor(page, 'waschen einseifen abtrocknen').locator('.row__title');
  await washing.fill('Hände waschen');
  await washing.press('Enter');

  await page.getByTitle('Seitenleiste einblenden').click();
  const search = page.getByLabel('Alle Sätze durchsuchen');

  await search.fill('Hände');
  await expect(page.locator('.hit')).toHaveText([/Hände waschen/]);

  await search.fill('einseifen');
  await expect(page.locator('.hit')).toHaveText([/Hände waschen/]);

  await search.fill('Hund');
  await expect(page.locator('.hit')).toHaveText([/Der Hund schläft/]);
});
