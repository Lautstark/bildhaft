import { expect, test } from '@playwright/test';

/**
 * The Prüfseite (`?pruefen`): one template, one combination, one sheet as it
 * prints — chosen with the app's own words, the Standard marked — and the
 * problems found over the measured combinations. It needs neither network nor
 * stored data, its symbols being drawn into data URLs, so nothing is mocked
 * here and any request leaving the page would be a mistake.
 *
 * Held here: the page draws, measures and switches, and the one finding fixed
 * for good (0f25025) — a Spiel's symbol is the one size on its Spielblatt and
 * its Kartenbogen. The open findings are the page's to show, not this suite's
 * to fail on.
 */
test('the Prüfseite shows a sheet per combination, offline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== 'localhost') outside.push(request.url());
  });

  await page.goto('/?pruefen');
  await expect(page.locator('main.pruef[data-fertig]')).toBeVisible({ timeout: 90_000 });

  /* The Spiel opens on its Standard, and its symbol is one size on both sheets. */
  const sheet = page.getByRole('region', { name: 'Bogen' });
  await expect(sheet.getByRole('heading', { name: 'Spiel · Standard' })).toBeVisible();
  await expect(sheet.locator('.ps-spiel')).toBeVisible();
  await expect(sheet.locator('.ps-spiel-cut')).toBeVisible();
  await expect(sheet.getByText('Symbol auf Spielbogen und Kartenbogen gleich')).toBeVisible();

  /* A switch moved: the sheet follows, and says so in its heading. */
  const anybook = page.locator('.pruef__achse', { hasText: 'Anybook' });
  await anybook.getByRole('button', { name: 'darüber' }).click();
  await expect(sheet.getByRole('heading', { name: 'Spiel · Anybook: darüber' })).toBeVisible();
  await expect(sheet.locator('.ps-sheet--any-above')).toBeVisible();
  await expect(sheet.getByText('Spielkarte: Symbol mit Anybook gleich groß')).toBeVisible();

  /* Numbers and the title are typed, as in the app. */
  await page.getByRole('textbox', { name: 'Titel', exact: true }).fill('Omas Spiel');
  await page.getByRole('textbox', { name: 'Titel', exact: true }).press('Enter');
  await expect(sheet.locator('.ps-title')).toHaveText('Omas Spiel');
  await page.getByRole('spinbutton', { name: 'Rand' }).fill('7');
  await page.getByRole('spinbutton', { name: 'Rand' }).press('Enter');
  await expect(sheet.getByRole('heading', { name: /Rand: 7 mm/ })).toBeVisible();

  /* No page runs off to the side. */
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Zurück zum Standard' }).click();
  await expect(sheet.getByRole('heading', { name: 'Spiel · Standard' })).toBeVisible();

  /* Another template brings its own switches: Wortkarten print on A4 only. */
  await page.getByRole('navigation', { name: 'Vorlage' }).getByRole('button', { name: 'Wortkarten' }).click();
  await expect(sheet.getByRole('heading', { name: 'Wortkarten · Standard' })).toBeVisible();
  await expect(page.locator('.pruef__achse', { hasText: 'Größe nach' })).toBeVisible();
  await expect(page.locator('.pruef__achse', { hasText: 'Papier' })).toHaveCount(0);

  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
});
