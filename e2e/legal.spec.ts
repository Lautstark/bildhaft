import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';

/*
 * § 5 DDG and Art. 13 DSGVO are satisfied by these two dialogs being reachable
 * from every screen and carrying the required details. That is easy to break
 * silently — a renamed link, a tidied-up footer, an address lost in a refactor —
 * and a broken one is a legal defect rather than a visual one. So the deploy is
 * gated on it, exactly as it is on printing and translating.
 */

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('the Impressum is one click away and names who runs the site', async ({ page }) => {
  // The label matters as much as the content: "Kontakt" would not count.
  await page.getByRole('button', { name: 'Impressum', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Impressum' });
  await expect(dialog).toBeVisible();
  // Name and a postal address are the parts § 5 DDG will not do without.
  await expect(dialog).toContainText('Stefanie Grewenig');
  await expect(dialog).toContainText('Talheide 5');
  await expect(dialog).toContainText('21149 Hamburg');
  // Plus a way to reach that person directly.
  await expect(dialog.locator('a[href^="mailto:"]')).toBeVisible();
});

test('the privacy notice names the two things that leave the browser', async ({ page }) => {
  await page.getByRole('button', { name: 'Datenschutz', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Datenschutz' });
  await expect(dialog).toBeVisible();
  // The hoster's logs and the ARASAAC lookup are the only processing there is,
  // and both have to be declared.
  await expect(dialog).toContainText('GitHub Pages');
  await expect(dialog).toContainText('ARASAAC');
  await expect(dialog).toContainText('IP-Adresse');
  // Local storage is consent-free only because it is declared as necessary.
  await expect(dialog).toContainText('TDDDG');
});
