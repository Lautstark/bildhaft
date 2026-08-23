import { expect, test } from '@playwright/test';

/**
 * The scheme, and the one thing about it that is easy to get wrong.
 *
 * A toggle that flips the page is the easy half and would pass with the whole
 * of it in the bundle. What these check is the half that only shows up on the
 * second visit: the choice has to survive a reload, and it has to be in force
 * before the bundle runs rather than a frame later — which is what the inline
 * script in index.html is for and what nothing else would notice if it went.
 */

async function openTheme(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Seitenleiste einblenden' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.locator('.panel', { hasText: 'Erscheinungsbild' }).locator('summary').click();
}

const track = (page: import('@playwright/test').Page) =>
  page.getByRole('group', { name: 'Erscheinungsbild' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens following the device, and says so in the heading', async ({ page }) => {
  await openTheme(page);
  await expect(page.locator('.panel', { hasText: 'Erscheinungsbild' }).locator('.state'))
    .toHaveText('Systemeinstellung');
  // The absence of the attribute is what "follows the OS" is: a page that wrote
  // data-theme here would have picked one, and picked it in the dark.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  await expect(track(page).locator('button[aria-pressed="true"]')).toHaveText('Systemeinstellung');
});

test('a chosen scheme is in force, named in the heading, and survives a reload', async ({ page }) => {
  await openTheme(page);
  await track(page).getByRole('button', { name: 'Dunkel' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.panel', { hasText: 'Erscheinungsbild' }).locator('.state'))
    .toHaveText('Dunkel');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the scheme is in force before the bundle has run', async ({ page }) => {
  await openTheme(page);
  await track(page).getByRole('button', { name: 'Hell' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Hold every script the page asks for. Whatever sets the attribute while
  // these are stalled is, by construction, not in the bundle — and the inline
  // script in index.html is the only other thing there is.
  let release = (): void => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/*.js', async (route) => { await held; await route.continue(); });

  // 'commit' rather than the default 'load': load cannot fire while the bundle
  // is held, and anything earlier races the navigation itself.
  await page.goto('/', { waitUntil: 'commit' });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
    .toBe('light');

  release();
});

test('going back to the device setting removes the choice rather than storing one', async ({ page }) => {
  await openTheme(page);
  await track(page).getByRole('button', { name: 'Hell' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await track(page).getByRole('button', { name: 'Systemeinstellung' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  // Not the word "system" written into storage: an absent key is what a later
  // reader has to see to know nobody chose, and it is what the inline script
  // above is written against.
  expect(await page.evaluate(() => localStorage.getItem('bildhaft.theme'))).toBeNull();
});
