import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';

/*
 * § 5 DDG and Art. 13 DSGVO are satisfied by these two dialogs being reachable
 * from every screen and carrying the required details. That is easy to break
 * silently — a renamed link, a tidied-up footer, an address lost in a refactor —
 * and a broken one is a legal defect rather than a visual one. So the deploy is
 * gated on it, exactly as it is on printing and translating.
 *
 * **Every claim is asked of the page's own `<section>`, not of the dialog.**
 * Since the three sheets became one `@lautstark/design/svelte/Legal` dialog —
 * conventions.md §6.12 — all three sections are in the document together and
 * the two not showing are `hidden`, so the dialog's text is the text of all
 * three pages at once. Asked of the dialog, „Stefanie Grewenig" and
 * „21149 Hamburg" are found in the privacy notice and an empty Impressum would
 * sail through; `a[href^="mailto:"]` matched twice and said so. `#impressumPage`
 * and `#privacyPage` are why `info.ts` gives each section an id.
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
  const impressum = dialog.locator('#impressumPage');
  // Showing, and not one of the two the same dialog is holding hidden.
  await expect(impressum).toBeVisible();
  // Name and a postal address are the parts § 5 DDG will not do without.
  await expect(impressum).toContainText('Stefanie Grewenig');
  await expect(impressum).toContainText('Talheide 5');
  await expect(impressum).toContainText('21149 Hamburg');
  // Plus a way to reach that person directly.
  await expect(impressum.locator('a[href^="mailto:"]')).toBeVisible();
});

test('the privacy notice names the two things that leave the browser', async ({ page }) => {
  await page.getByRole('button', { name: 'Datenschutz', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Datenschutz' });
  await expect(dialog).toBeVisible();
  const privacy = dialog.locator('#privacyPage');
  await expect(privacy).toBeVisible();
  // The hoster's logs and the ARASAAC lookup are the only processing there is,
  // and both have to be declared.
  await expect(privacy).toContainText('GitHub Pages');
  await expect(privacy).toContainText('ARASAAC');
  await expect(privacy).toContainText('IP-Adresse');
  // Local storage is consent-free only because it is declared as necessary.
  await expect(privacy).toContainText('TDDDG');
});
