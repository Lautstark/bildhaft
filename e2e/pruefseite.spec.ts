import { expect, test } from '@playwright/test';

/**
 * The Prüfseite (`?pruefen`): every template's print in its variants, drawn
 * by the app's own sheet and measured. It needs neither network nor stored
 * data — its symbols are drawn into data URLs — so nothing is mocked here,
 * and any request leaving the page would be a mistake.
 *
 * What is held here is that the page works and measures, and the one finding
 * that is fixed for good (0f25025): a Spiel's symbol is the one size on its
 * Spielblatt and on its Kartenbogen. The open findings are the page's to show,
 * not this suite's to fail on.
 */
test('the Prüfseite draws and measures every case, offline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== 'localhost') outside.push(request.url());
  });

  await page.goto('/?pruefen');
  await expect(page.locator('main.pruef[data-fertig]')).toBeVisible({ timeout: 90_000 });

  const tiles = page.locator('.kachel');
  const count = await tiles.count();
  expect(count).toBeGreaterThan(100);
  await expect(page.locator('.kachel[data-gemessen]')).toHaveCount(count);
  /* One Standard per template, highlighted, and its defaults written out. */
  await expect(page.locator('.kachel--standard')).toHaveCount(8);
  await expect(page.locator('.vorlage__std')).toHaveCount(8);
  await expect(page.locator('#vorlage-spiel .vorlage__eigen', { hasText: 'A4 quer' })).toBeVisible();

  /* Every card a Spiel cuts has its measured size on it. */
  const spiel = page.locator('#spiel-standard');
  await expect(spiel.locator('.kachel__arten')).toContainText('Spielkarte');
  await expect(spiel.locator('.kachel__mass').first()).toBeVisible();
  await expect(spiel.locator('.kachel__ok', { hasText: 'Spielbogen und Kartenbogen gleich' })).toBeVisible();

  /* Question 1, over every Spiel case: answered, and answered yes. */
  const spielColumn = await page.locator('.pruef__fragen thead th').allInnerTexts();
  const at = spielColumn.indexOf('Spiel');
  await expect(page.locator('.pruef__fragen tbody tr').first().locator('td').nth(at - 1)).toHaveClass(/\bok\b/);

  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
});
