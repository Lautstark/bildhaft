import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import {
  arasaacHeading, chooseFakeFolder, openSymbolSettings, withoutDirectoryPicker,
} from './metacom-folder.ts';

/**
 * A Sammlung's own symbol source: the sheet behind its ⋯, and what it changes.
 *
 * The thing worth testing is not that a radio can be pressed. It is the pair of
 * claims the arrangement makes and could quietly stop keeping — that a Sammlung
 * which has answered for itself is left alone when the default moves, and that
 * one which has not moves with it. Both are invisible from inside a single
 * Sammlung, so every test here uses two.
 *
 * **How the tests tell which source drew the page.** The footer carries
 * ARASAAC's credit and nothing else: it is required by that licence and
 * METACOM's own copy carries no obligation on bildhaft's side, so the line is
 * present under ARASAAC and absent under METACOM. It is written from
 * `provider().attribution` on every render, which makes it the page's plainest
 * statement of which source is in force. A blob: URL would not do — ARASAAC
 * caches its bytes and hands back an object URL too.
 */

const menu = (page: Page) =>
  page.getByRole('button', { name: 'Aktionen für diese Sammlung' });

/** ARASAAC's credit, which is present exactly when ARASAAC drew the page. */
const credit = (page: Page) => page.locator('.footer__credit');

/*
 * A row by what it stands for rather than by its words. „Standard folgen"
 * names the source it currently resolves to, so it contains "ARASAAC" too —
 * filtering on text would match two rows, which is the list working as
 * intended rather than a locator to work around.
 */
const sheetRow = (page: Page, choice: '' | 'arasaac' | 'metacom') =>
  page.locator(`.source[data-choice="${choice}"]`);

async function openSourceSheet(page: Page): Promise<void> {
  await menu(page).click();
  await page.getByRole('menuitem', { name: 'Einstellungen dieser Sammlung …' }).click();
  await expect(page.getByRole('heading', { name: 'Symbolquelle' })).toBeVisible();
}

async function closeSheet(page: Page): Promise<void> {
  await page.locator('.sheet .foot').getByRole('button', { name: 'Fertig' }).click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);
}

/** This product opens with the sidebar put away, so the controls are behind it. */
async function showSidebar(page: Page): Promise<void> {
  const reveal = page.getByTitle('Seitenleiste einblenden');
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  await expect(page.locator('.sidebar')).toBeVisible();
}

/** A second Sammlung, named, so the two can be told apart in the sidebar. */
async function newCollection(page: Page, name: string): Promise<void> {
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  // Creating is asynchronous and the focus lands at the end of it, so typing
  // before the field has it goes nowhere at all.
  await expect(page.getByLabel('Name der Sammlung')).toBeFocused();
  // The invented name is selected, so typing replaces it (§1.5).
  await page.keyboard.type(name);
  await expect(page.locator('.collections__name', { hasText: name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await withoutDirectoryPicker(page);
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('the ⋯ holds what this Sammlung is set to, under the export and above the delete', async ({ page }) => {
  await menu(page).click();

  // conventions.md §3.6's order: the exports first, the settings under them,
  // the delete last. The middle item is not an act on the Sammlung, which is
  // the amendment that section carries.
  await expect(page.locator('.menu button')).toHaveText([
    'Sammlung exportieren', 'Einstellungen dieser Sammlung …', 'Sammlung löschen',
  ]);
});

test('a Sammlung with no source of its own follows the default, and says which', async ({ page }) => {
  await openSourceSheet(page);

  await expect(sheetRow(page, '')).toHaveAttribute('aria-checked', 'true');
  // Naming the source it currently resolves to, because "the default" on its
  // own is a word with no referent for somebody deciding between two of them.
  await expect(sheetRow(page, '')).toContainText('ARASAAC');
  await expect(sheetRow(page, 'arasaac')).toHaveAttribute('aria-checked', 'false');
});

test('METACOM is shown but not offered until a folder is set up', async ({ page }) => {
  await openSourceSheet(page);

  // Shown, because "METACOM is not set up in this browser" is the answer
  // somebody opening this list came for. Not offered, because a Sammlung
  // pointed at a source nothing can answer draws nothing at all.
  const row = sheetRow(page, 'metacom');
  await expect(row).toBeVisible();
  await expect(row).toBeDisabled();
  await expect(row).toContainText('Einstellungen');
});

test('a Sammlung that answered for itself keeps its source when the default moves', async ({ page }) => {
  // Adopting the folder makes METACOM the default; the Sammlung that is open
  // follows it, so the ARASAAC credit goes.
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await expect(credit(page)).toHaveCount(0);

  // A second Sammlung, told to use METACOM itself rather than by inheritance.
  await newCollection(page, 'Zweite');
  await openSourceSheet(page);
  await sheetRow(page, 'metacom').click();
  await expect(sheetRow(page, 'metacom')).toHaveAttribute('aria-checked', 'true');
  await expect(sheetRow(page, '')).toHaveAttribute('aria-checked', 'false');
  await closeSheet(page);

  // Now move the default back to ARASAAC.
  await openSymbolSettings(page);
  await arasaacHeading(page).click();
  await page.getByRole('button', { name: 'Als Standard verwenden' }).click();
  // And say what that did — and, here, what it did not do.
  await expect(page.locator('.toast')).toContainText('bleibt, wie sie ist');
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  // „Zweite" answered for itself, so it is untouched: still METACOM, no credit.
  await expect(credit(page)).toHaveCount(0);

  // The first Sammlung never answered, so it followed the default there and
  // follows it back.
  await showSidebar(page);
  await page.locator('.collections__item').filter({ hasNotText: 'Zweite' }).first().click();
  await expect(credit(page)).toContainText('ARASAAC');
});

test('and can be told to follow the default again', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  await newCollection(page, 'Zweite');
  await openSourceSheet(page);
  await sheetRow(page, 'arasaac').click();
  await closeSheet(page);
  // Its own answer, against a default of METACOM.
  await expect(credit(page)).toContainText('ARASAAC');

  await openSourceSheet(page);
  await sheetRow(page, '').click();
  await expect(sheetRow(page, '')).toHaveAttribute('aria-checked', 'true');
  await closeSheet(page);

  // Following again, which is a state and not a cleared field: the default is
  // METACOM, so the credit goes with it.
  await expect(credit(page)).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('folgt wieder der Standardquelle');
});
