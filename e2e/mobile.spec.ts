import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translateAll } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('the sidebar is reachable from the header', async ({ page }) => {
  // Regression: the sidebar was display:none on mobile with no way to open it.
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.sidebar')).not.toBeInViewport();

  await page.getByLabel('Menü öffnen').click();
  await expect(page.locator('.sidebar')).toBeInViewport();
  await expect(page.locator('.scrim')).toBeVisible();

  // Choosing a collection dismisses the overlay panel.
  await page.locator('.collections__item').first().click();
  await expect(page.locator('.sidebar')).not.toBeInViewport();
});

test('the header stays opaque over scrolled content', async ({ page }) => {
  await translateAll(page, ['Ich möchte einen Apfel essen', 'Wir trinken Apfelsaft', 'Der Hund schläft']);
  await page.mouse.wheel(0, 600);

  const bar = page.locator('.topbar');
  await expect(bar).toBeInViewport();
  const bg = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Regression: content used to show straight through a transparent rail.
  expect(bg).not.toMatch(/rgba\(.*,\s*0\)/);
  expect(bg).not.toBe('transparent');
});

test('the document scrolls rather than a nested container', async ({ page }) => {
  // Regression: a nested full-height scroller produced blank/black repaints when
  // mobile browsers resized the viewport.
  const overflow = await page.locator('.main').evaluate((el) => getComputedStyle(el).overflowY);
  expect(overflow).toBe('visible');
});

test('does not open the keyboard on load', async ({ page }) => {
  // Autofocus on touch shrinks the viewport the moment the page appears.
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).not.toBe('TEXTAREA');
});
