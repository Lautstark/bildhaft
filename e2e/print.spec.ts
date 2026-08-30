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

/*
 * "Symbolgröße" sizes the picture; the scissors go round the cut margin outside
 * it, so 50mm symbols leave 56mm cards. Nothing on the sheet measures the
 * figure that was typed in, which is why the dialog has to name the one a ruler
 * will find — and why this checks the readout against the card that is actually
 * drawn rather than against a second copy of the same arithmetic.
 */
test('names the card a ruler will find, not just the symbol', async ({ page }) => {
  const hint = page.locator('.opt', { has: page.getByLabel('Symbolgröße') }).locator('.small.faint');
  const card = page.locator('.preview-frame .ps-card').first();
  const box = async () => card.evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));

  await expect(hint).toHaveText('Karte zum Ausschneiden: 46 × 52 mm.');
  expect(mm((await box()).w)).toBeCloseTo(46, 0);
  expect(mm((await box()).h)).toBeCloseTo(52, 0);

  await page.getByLabel('Symbolgröße').fill('50');
  await expect(hint).toHaveText('Karte zum Ausschneiden: 56 × 62 mm.');

  // A frame grows the card, so both figures have to grow with it. Checked to
  // the millimetre and no finer: offsetWidth is whole pixels, which is where
  // the tenths in the readout come from being measured a better way.
  await page.getByLabel('Rahmen um jede Karte').check();
  await expect(hint).toHaveText('Karte zum Ausschneiden: 60,3 × 65,8 mm.');
  expect(mm((await box()).w)).toBeCloseTo(60.3, 0);
  expect(mm((await box()).h)).toBeCloseTo(65.8, 0);
});

/*
 * The grid decides the card size instead of the other way round, and the size
 * it lands on is the one thing the settings do not state anywhere.
 */
test('a grid says what size its cells came out', async ({ page }) => {
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');

  const hint = page.getByText('Karte zum Ausschneiden:');
  await expect(hint).toHaveText('Karte zum Ausschneiden: 63,3 × 128,9 mm.');
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
 * The paper outlives the tab, so the credit line has to say where the printout
 * came from in a form somebody holding it can act on — and keep it clickable
 * for the case where the "print" was a PDF.
 */
test('the credit line gives the address, not just the name', async ({ page }) => {
  const link = page.locator('#print-root .ps-attribution a');
  await expect(link).toHaveText('https://bildhaft.lautstark.tech');
  await expect(link).toHaveAttribute('href', 'https://bildhaft.lautstark.tech');

  // Grey like the sentence it sits in: a blue underline is for screens.
  expect(await link.evaluate((el: HTMLElement) => getComputedStyle(el).textDecorationLine))
    .toBe('none');
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
    document.getElementById('print-page-setup')?.textContent)).toContain('size: 297mm 210mm');
});

test('paper size drives the sheet, the printer rule and the grid together', async ({ page }) => {
  const sheet = page.locator('.preview-frame .ps-sheet');
  const rule = () => page.evaluate(() =>
    document.getElementById('print-page-setup')?.textContent ?? '');

  await page.getByRole('button', { name: 'A3', exact: true }).click();
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(297, 0);
  expect(await rule()).toContain('size: 297mm 420mm');

  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(148, 0);
  expect(await rule()).toContain('size: 148mm 210mm');

  /*
   * The cards have to follow the paper, not just the sheet around them. Height,
   * not width: a card's width comes from the grid's 1fr columns and so tracks
   * the sheet whatever the paper table says, which makes it useless as evidence.
   * The row height is the one measurement read straight off that table, so it is
   * the one that catches a grid still dividing A4 on an A5 page.
   */
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');
  const card = page.locator('.preview-frame .ps-card').first();
  // A5 portrait: 210mm less two 10mm margins, less the room ARASAAC's credit
  // needs, halved.
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetHeight)))
    .toBeCloseTo(85.4, 0);
});

test('a card grid fills the page with exactly the asked-for cells', async ({ page }) => {
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');

  const grid = page.locator('.preview-frame .ps-grid').first();
  await expect(grid).toBeVisible();

  /*
   * Six cells across a 190mm x 277mm printable area. Full width, so 63.3mm
   * each. The height is short of 277/2 because ARASAAC's credit is a licence
   * condition and always prints, and a grid page leaves it room rather than
   * pushing it onto a sheet of its own.
   */
  const card = grid.locator('.ps-card').first();
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(63.3, 0);
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetHeight))).toBeCloseTo(128.9, 0);

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

/*
 * A strip frame is a cutting line for the whole strip, so the sentence text has
 * to be inside it: a strip cut out along a frame that excluded its caption would
 * lose the sentence it is a strip of.
 */
test('a strip frame encloses the sentence text and the symbols', async ({ page }) => {
  const strip = page.locator('.preview-frame .ps-sentence').first();
  expect(await strip.evaluate((el: HTMLElement) => getComputedStyle(el).borderTopStyle)).toBe('none');

  await page.getByLabel('Rahmen um den ganzen Streifen').check();
  expect(await strip.evaluate((el: HTMLElement) => getComputedStyle(el).borderTopStyle)).toBe('solid');

  const boxes = await strip.evaluate((el: HTMLElement) => {
    const outer = el.getBoundingClientRect();
    const caption = el.querySelector('.ps-caption')!.getBoundingClientRect();
    const row = el.querySelector('.ps-row')!.getBoundingClientRect();
    return { top: outer.top, bottom: outer.bottom, capTop: caption.top, rowBottom: row.bottom };
  });
  expect(boxes.capTop).toBeGreaterThan(boxes.top);
  expect(boxes.rowBottom).toBeLessThan(boxes.bottom);

  // And it reaches the printable copy, not only the preview.
  expect(await page.locator('#print-root .ps-sentence').first()
    .evaluate((el: HTMLElement) => getComputedStyle(el).borderTopStyle)).toBe('solid');
});

/*
 * Card sheets have no strips to frame, and the sentence text they would carry
 * is not printed either — so the option has to be unavailable rather than a
 * checkbox that quietly does nothing.
 */
test('the strip frame is offered only for strips', async ({ page }) => {
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await expect(page.getByLabel('Rahmen um den ganzen Streifen')).toBeDisabled();
});

test('the ARASAAC credit fits in the room a grid page leaves it', async ({ page }) => {
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  // One card per page, so the last page is full and reaches the paper's edge.
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');

  /*
   * offsetTop/offsetHeight rather than getBoundingClientRect: the preview sits
   * inside a transform: scale(), so rects come back in scaled pixels.
   * ARASAAC's credit is a sentence long and is the one that wraps.
   */
  const used = await page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) => {
    const pages = sheet.querySelectorAll<HTMLElement>('.ps-grid');
    const last = pages[pages.length - 1];
    const credit = sheet.querySelector<HTMLElement>('.ps-attribution')!;
    return (credit.offsetTop + credit.offsetHeight - last.offsetTop) / (96 / 25.4);
  });
  expect(used).toBeLessThanOrEqual(277);
});

/*
 * The same room, under the two things that make that line longest: the
 * narrowest paper this app offers, and a Sammlung named the way people name
 * one. The allowance gives the collection's line exactly one line, so a name
 * long enough to wrap it is a page carrying nothing but the tail of a credit —
 * which is why the name is clipped rather than the allowance made bigger, and
 * why the address has to survive the clipping intact.
 */
test('a long name is clipped so the credit keeps to its one line', async ({ page }) => {
  await page.locator('.sheet .foot').getByRole('button', { name: 'Schließen' }).click();
  await expect(page.locator('dialog.sheet')).toBeHidden();
  await page.getByLabel('Name der Sammlung', { exact: true })
    .fill('Kindergarten Sonnenschein – Morgenkreis und Mittagsrunde');
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();

  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');

  const used = await page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) => {
    const pages = sheet.querySelectorAll<HTMLElement>('.ps-grid');
    const last = pages[pages.length - 1]!;
    const credit = sheet.querySelector<HTMLElement>('.ps-attribution')!;
    return (credit.offsetTop + credit.offsetHeight - last.offsetTop) / (96 / 25.4);
  });
  // A5 portrait: 210mm less two 10mm margins.
  expect(used).toBeLessThanOrEqual(190);

  // Clipped, and clipped in the right place: the name gives way, the address
  // is printed whole. scrollWidth is what the name would need; clientWidth is
  // what it got.
  const line = await page.locator('.preview-frame .ps-made').evaluate((made: HTMLElement) => {
    const name = made.querySelector<HTMLElement>('.ps-made__name')!;
    const tail = made.querySelector<HTMLElement>('.ps-made__tail')!;
    return {
      wanted: name.scrollWidth,
      got: name.clientWidth,
      tailClipped: tail.scrollWidth > tail.clientWidth,
      lines: Math.round(made.offsetHeight / parseFloat(getComputedStyle(made).lineHeight)),
    };
  });
  expect(line.wanted).toBeGreaterThan(line.got);
  expect(line.tailClipped).toBe(false);
  expect(line.lines).toBe(1);
  await expect(page.locator('.preview-frame .ps-url')).toHaveText('https://bildhaft.lautstark.tech');
});

/*
 * A printout is a stack of paper that looks like every other stack of paper.
 * The name is the one thing that tells this stack from the folder's other
 * twenty, so it has to reach the printable copy and not only the preview.
 */
test('the collection name can head the sheet', async ({ page }) => {
  await page.locator('.sheet .foot').getByRole('button', { name: 'Schließen' }).click();
  await expect(page.locator('dialog.sheet')).toBeHidden();
  await page.getByLabel('Name der Sammlung', { exact: true }).fill('Morgenkreis');
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();

  await expect(page.locator('.preview-frame .ps-title')).toHaveCount(0);

  await page.getByLabel('Name der Sammlung auf der ersten Seite').check();
  await expect(page.locator('.preview-frame .ps-title')).toHaveText('Morgenkreis');
  await expect(page.locator('#print-root .ps-title')).toHaveText('Morgenkreis');

  // Once, above everything — not a running header. Two sentences broken onto a
  // page each is the case that would show a second copy if it were one.
  await page.getByLabel('Ein Satz pro Seite').check();
  await expect(page.locator('#print-root .ps-sentence--page')).toHaveCount(1);
  await expect(page.locator('#print-root .ps-title')).toHaveCount(1);
});

/*
 * The heading has to be paid for out of the cards, the way the credit block is.
 * A grid page is exactly as tall as the paper, so a heading the grid did not
 * know about pushes its bottom row onto a sheet of its own.
 */
test('a headed grid page takes its room from the cards, not from the paper', async ({ page }) => {
  await page.getByLabel('Name der Sammlung auf der ersten Seite').check();
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  // One card per page, so the first page is full and reaches the paper's edge.
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');

  // offsetTop/offsetHeight rather than getBoundingClientRect: the preview sits
  // inside a transform: scale(), so rects come back in scaled pixels.
  const used = await page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) => {
    const title = sheet.querySelector<HTMLElement>('.ps-title')!;
    const first = sheet.querySelector<HTMLElement>('.ps-grid')!;
    return (first.offsetTop + first.offsetHeight - title.offsetTop) / (96 / 25.4);
  });
  expect(used).toBeLessThanOrEqual(277);
});
