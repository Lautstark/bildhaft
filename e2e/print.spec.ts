import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translateAll } from './helpers.ts';

/** CSS reference resolution: 96px per inch. */
const mm = (px: number) => +(px / (96 / 25.4)).toFixed(2);

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await translateAll(page, ['Ich möchte einen Apfel essen', 'Ich möchte schlafen']);
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect(page.locator('.preview-frame .ps-sheet')).toBeVisible();
});

test('renders the sheet at real millimetre sizes', async ({ page }) => {
  const sheet = page.locator('.preview-frame .ps-sheet');
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(210, 0);

  // Defaults are 40mm symbols with a 3mm cut margin on each side.
  const card = page.locator('.preview-frame .ps-card').first();
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetWidth))).toBeCloseTo(46, 0);
  expect(mm(await page.locator('.preview-frame .ps-card__img').first()
    .evaluate((el: HTMLElement) => el.offsetWidth))).toBeCloseTo(40, 0);
});

test('millimetre controls change the printed geometry', async ({ page }) => {
  await page.getByLabel('Symbolgröße').fill('25');
  await page.getByLabel('Schneiderand').fill('5');

  const card = page.locator('.preview-frame .ps-card').first();
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(35, 0);

  // The hidden printable DOM must match the preview, not just the on-screen copy.
  const printed = page.locator('#print-root .ps-card').first();
  expect(await printed.evaluate((el: HTMLElement) => getComputedStyle(el).getPropertyValue('--sym').trim()))
    .toBe('25mm');
});

test('card sheet collapses duplicate symbols', async ({ page }) => {
  const strip = await page.locator('.preview-frame .ps-card').count();
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  const sheet = await page.locator('.preview-frame .ps-card').count();

  // "Ich" and "möchte" appear in both sentences but should yield one card each.
  expect(sheet).toBeLessThan(strip);
  const labels = await page.locator('.preview-frame .ps-card__label').allTextContents();
  expect(new Set(labels).size).toBe(labels.length);
});

test('always prints the ARASAAC attribution', async ({ page }) => {
  await expect(page.locator('#print-root .ps-attribution')).toContainText('ARASAAC');
  await expect(page.locator('#print-root .ps-attribution')).toContainText('CC BY-NC-SA');
});

/*
 * The rest of this file inspects the DOM in screen media, where the dialog is
 * meant to be visible. Nothing did that in print media, and that is exactly
 * where the regression lived: openDialog() moved the sheet to a native <dialog>
 * on document.body, which put it outside #app-root and into the top layer, so
 * the rule that strips the UI stopped reaching it and the browser's print
 * preview showed the dialog instead of the page.
 */
test('print media shows the sheet and nothing of the UI', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });

  const shown = (selector: string) => page.locator(selector).evaluate(
    (el: HTMLElement) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0);

  expect(await shown('#print-root')).toBe(true);
  expect(await page.locator('#print-root .ps-card').count()).toBeGreaterThan(0);

  // The two pieces of UI, one of which is not inside #app-root.
  expect(await shown('#app-root')).toBe(false);
  expect(await shown('dialog.sheet')).toBe(false);

  // Hidden for printing only: the dialog is never closed behind the user's back,
  // so the settings and the preview are still there when the print job returns.
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('dialog.sheet')).toBeVisible();
  await expect(page.locator('.preview-frame .ps-sheet')).toBeVisible();
});

test('exports references only, never image data', async ({ page }) => {
  await page.locator('.sheet .foot').getByRole('button', { name: 'Schließen' }).click();
  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Sammlung exportieren' }).click();
  const file = await (await download).createReadStream();

  let raw = '';
  for await (const chunk of file) raw += chunk;
  const data = JSON.parse(raw);

  expect(data.format).toBe('bildhaft.collection');
  expect(data.sentences).toHaveLength(2);
  // The licensing guarantee: no pixels ever leave in a shared file.
  expect(raw).not.toMatch(/data:image|base64/);
});

test('turns the paper sideways', async ({ page }) => {
  const sheet = page.locator('.preview-frame .ps-sheet');
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(210, 0);

  await page.getByRole('button', { name: 'Quer' }).click();
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(297, 0);

  // @page is the only thing that turns the actual printer, and it cannot be
  // written from a class — so the rule itself is what has to be checked.
  expect(await page.evaluate(() =>
    document.getElementById('print-page-setup')?.textContent)).toContain('A4 landscape');
});

test('a card grid fills the page with exactly the asked-for cells', async ({ page }) => {
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');

  const grid = page.locator('.preview-frame .ps-grid').first();
  await expect(grid).toBeVisible();

  // Six cells across a 190mm x 277mm printable area: 63.3mm x 138.5mm each.
  const card = grid.locator('.ps-card').first();
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(63.3, 0);
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetHeight))).toBeCloseTo(138.5, 0);

  // Five distinct symbols across the two sentences fit on one page of six.
  expect(await page.locator('.preview-frame .ps-grid').count()).toBe(1);

  // A page break has to be a real break, not a gap: with more cards than cells
  // the second page starts a new sheet.
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await expect(page.locator('.preview-frame .ps-grid')).toHaveCount(2);
  expect(await page.locator('.preview-frame .ps-grid').first()
    .evaluate((el: HTMLElement) => getComputedStyle(el).breakAfter)).toBe('page');
});

test('a card frame is drawn inside the cut margin, not on it', async ({ page }) => {
  // Nothing configured: no frame element at all, and the card keeps the size
  // it has always had.
  await expect(page.locator('.preview-frame .ps-card__frame')).toHaveCount(0);
  const card = page.locator('.preview-frame .ps-card').first();
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetWidth))).toBeCloseTo(46, 0);

  await page.getByLabel('Rahmen um jede Karte').check();
  const frame = page.locator('.preview-frame .ps-card__frame').first();
  await expect(frame).toHaveCount(1);

  // The frame must sit strictly inside the card, or the scissors go through it.
  const boxes = await card.evaluate((el: HTMLElement) => {
    const outer = el.getBoundingClientRect();
    const inner = el.querySelector('.ps-card__frame')!.getBoundingClientRect();
    return { outer: outer.left, inner: inner.left, outerRight: outer.right, innerRight: inner.right };
  });
  expect(boxes.inner).toBeGreaterThan(boxes.outer);
  expect(boxes.innerRight).toBeLessThan(boxes.outerRight);

  await page.getByLabel('Hintergrundfarbe').check();
  expect(await frame.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor))
    .not.toBe('rgba(0, 0, 0, 0)');

  // And it reaches the printable copy, not only the preview.
  await expect(page.locator('#print-root .ps-card__frame').first()).toHaveCount(1);
});
