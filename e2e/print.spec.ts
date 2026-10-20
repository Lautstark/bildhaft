import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { mockArasaac } from './arasaac-mock.ts';
import { backToPrint, cardSheet, openLook, showMaterial, showSheet, translateAll } from './helpers.ts';

/** CSS reference resolution: 96px per inch. */
const mm = (px: number) => +(px / (96 / 25.4)).toFixed(2);

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await translateAll(page, ['Ich möchte einen Apfel essen', 'Ich möchte schlafen']);
  await showSheet(page);
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
  // the tenths in the readout come from being measured a better way. The frame
  // is the Sammlung's „Aussehen", the readout the print dialog's.
  await openLook(page);
  await page.getByLabel('Rahmen um jede Karte').check();
  await backToPrint(page);
  await expect(hint).toHaveText('Karte zum Ausschneiden: 60,3 × 65,8 mm.');
  expect(mm((await box()).w)).toBeCloseTo(60.3, 0);
  expect(mm((await box()).h)).toBeCloseTo(65.8, 0);
});

/*
 * The grid decides the card size instead of the other way round, and the size
 * it lands on is the one thing the settings do not state anywhere.
 */
test('a grid says what size its cells came out', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');

  const hint = page.getByText('Karte zum Ausschneiden:');
  await expect(hint).toHaveText('Karte zum Ausschneiden: 63,3 × 131,7 mm.');
});

/*
 * The card size is the other direction of the same question, and the one an
 * existing board asks: 60 x 90 typed in has to come off the printer as 60 x 90
 * measured, whatever is inside it. So this checks the card a ruler finds rather
 * than the readout — the readout is what the other tests above hold to the
 * card, and here the card is the thing that was promised.
 */
test('a card size is the card, cut line to cut line', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('60');
  await page.getByRole('spinbutton', { name: 'Höhe' }).fill('90');

  const card = page.locator('.preview-frame .ps-card').first();
  const box = async () => card.evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));
  await expect.poll(async () => mm((await box()).w)).toBeCloseTo(60, 0);
  expect(mm((await box()).h)).toBeCloseTo(90, 0);

  // And the printable copy is the same card, not just the on-screen one.
  const printed = page.locator('#print-root .ps-card').first();
  expect(mm(await printed.evaluate((el: HTMLElement) =>
    parseFloat(getComputedStyle(el).width)))).toBeCloseTo(60, 0);

  /*
   * The cut margin changes sides here. Against a symbol size it is added around
   * the card; against a card size there is nothing to add it to, so it comes
   * out of the symbol and the card keeps the size it was given.
   */
  const symbol = () => page.locator('.preview-frame .ps-card__img').first()
    .evaluate((el: HTMLElement) => el.offsetHeight);
  const roomy = await symbol();
  await page.getByLabel('Schneiderand').fill('12');
  await expect.poll(symbol).toBeLessThan(roomy);
  expect(mm((await box()).w)).toBeCloseTo(60, 0);
  expect(mm((await box()).h)).toBeCloseTo(90, 0);
});

/* A square card is the usual one, and typing 60 twice is one chance in two to
   mistype it — so an empty height is an answer rather than a missing one. */
test('an empty height means as high as it is wide', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('55');
  await page.getByRole('spinbutton', { name: 'Höhe' }).fill('');
  await page.getByRole('spinbutton', { name: 'Höhe' }).blur();

  const card = page.locator('.preview-frame .ps-card').first();
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetHeight)))
    .toBeCloseTo(55, 0);
  await expect(page.getByRole('spinbutton', { name: 'Höhe' })).toHaveAttribute('placeholder', '55');
});

/*
 * Said, not silently worked around. A card bigger than the paper could be shrunk
 * to fit, and then the one number the person came here to fix would be the one
 * number the printout does not honour.
 */
test('says so when the card does not fit the paper', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('60');
  await expect(page.getByText(/^Symbol \d/)).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Breite' }).fill('200');
  await expect(page.getByText('Diese Karte passt nicht auf das Papier.')).toBeVisible();
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

  // The UI, the column with the sheet's settings included, is all in #app-root.
  expect(await shown('#app-root')).toBe(false);

  // Hidden for printing only: the column and its preview are still there when
  // the print job returns.
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.print-view .preview-frame .ps-sheet')).toBeVisible();
});

test('exports references only, never image data', async ({ page }) => {
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
  await cardSheet(page);
  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');
  const card = page.locator('.preview-frame .ps-card').first();
  // A5 portrait: 210mm less 10mm at the top and 6mm at the foot, less the room ARASAAC's credit
  // needs, halved.
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetHeight)))
    .toBeCloseTo(88.1, 0);
});

test('a card grid fills the page with exactly the asked-for cells', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');

  const grid = page.locator('.preview-frame .ps-grid').first();
  await expect(grid).toBeVisible();

  /*
   * Six cells across a 190mm x 281mm printable area — 10mm off the top, 6mm
   * off the foot. Full width, so 63.3mm each. The height is short of 281/2 because ARASAAC's credit is a licence
   * condition and always prints, and a grid page leaves it room rather than
   * pushing it onto a sheet of its own.
   */
  const card = grid.locator('.ps-card').first();
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(63.3, 0);
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetHeight))).toBeCloseTo(131.7, 0);

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

  await openLook(page);
  await page.getByLabel('Rahmen um jede Karte').check();
  const frame = page.locator('.preview-frame .ps-card__frame').first();
  await expect(frame).toHaveCount(1);

  // The frame must sit strictly inside the card, or the scissors go through it.
  // Polled, as everything read off the preview right after a change: it lays
  // its pages out again, and a card read while that happens is one replaced.
  const inside = () => card.evaluate((el: HTMLElement) => {
    const outer = el.getBoundingClientRect();
    const inner = el.querySelector('.ps-card__frame')?.getBoundingClientRect();
    return Boolean(inner) && inner!.left > outer.left && inner!.right < outer.right;
  });
  await expect.poll(inside).toBe(true);

  await page.getByLabel('Hintergrundfarbe').check();
  await expect.poll(() => frame.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor))
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

  await openLook(page);
  await page.getByLabel('Rahmen um den ganzen Streifen').check();
  // Polled: the preview lays its pages out again after a change, and a strip
  // read while that happens is one already replaced.
  await expect.poll(() => strip.evaluate((el: HTMLElement) => getComputedStyle(el).borderTopStyle)).toBe('solid');

  const encloses = () => strip.evaluate((el: HTMLElement) => {
    const outer = el.getBoundingClientRect();
    const caption = el.querySelector('.ps-caption')?.getBoundingClientRect();
    const row = el.querySelector('.ps-row')?.getBoundingClientRect();
    return Boolean(caption && row) && caption!.top > outer.top && row!.bottom < outer.bottom;
  });
  await expect.poll(encloses).toBe(true);

  // And it reaches the printable copy, not only the preview.
  await expect.poll(() => page.locator('#print-root .ps-sentence').first()
    .evaluate((el: HTMLElement) => getComputedStyle(el).borderTopStyle)).toBe('solid');
});

/*
 * The sentence text is asked what the label is asked, the same way and beside
 * it: whether, over the row or under it, and how big. Where and how big are
 * there only while it prints, as the label's are — and the label's size has
 * left „Größe“ to stand under its own check.
 */
test('the sentence text prints over or under its row, at its own size', async ({ page }) => {
  const strip = page.locator('.preview-frame .ps-sentence').first();
  const captionBelowRow = () => strip.evaluate((el: HTMLElement) => {
    const caption = el.querySelector('.ps-caption')!.getBoundingClientRect();
    const row = el.querySelector('.ps-row')!.getBoundingClientRect();
    return caption.top >= row.bottom;
  });
  const sentence = page.locator('.opt__sub', { has: page.getByLabel('Schriftgröße des Satztexts') });

  await expect.poll(captionBelowRow).toBe(false);
  await sentence.getByRole('button', { name: 'unten' }).click();
  await expect.poll(captionBelowRow).toBe(true);
  await expect(page.locator('#print-root .ps-sentence').first().locator('.ps-caption')).toHaveClass(/ps-caption--below/);

  // In points, as typed: 72 to the inch, the browser's 96 pixels to it.
  const pt = (el: HTMLElement) => (parseFloat(getComputedStyle(el).fontSize) * 72) / 96;
  await page.getByLabel('Schriftgröße des Satztexts').fill('14');
  await expect.poll(() => strip.locator('.ps-caption').evaluate(pt)).toBeCloseTo(14, 1);
  // Its own size, not the label's.
  expect(await page.locator('.preview-frame .ps-card__label').first().evaluate(pt)).toBeCloseTo(11, 1);

  await page.getByLabel('Satztext drucken').uncheck();
  await expect(strip.locator('.ps-caption')).toHaveCount(0);
  await expect(page.getByLabel('Schriftgröße des Satztexts')).toHaveCount(0);

  await expect(page.getByLabel('Schriftgröße der Beschriftung')).toBeVisible();
  await page.getByLabel('Beschriftung drucken').uncheck();
  await expect(page.getByLabel('Schriftgröße der Beschriftung')).toHaveCount(0);
  await expect(page.getByLabel('Schriftgröße', { exact: true })).toHaveCount(0);
});

/*
 * The template is the choice: a Satzstreifen prints as strips, cards to cut
 * out are the Wortkarten's. So neither offers the other's layout, and a card
 * sheet has no strips to frame — the option is not there rather than a
 * checkbox that quietly does nothing.
 */
test('the template decides strips or cards, and each offers only its own', async ({ page }) => {
  const settings = page.locator('.print-view__panel');
  await expect(settings.getByRole('button', { name: 'Kartenblatt' })).toHaveCount(0);
  await expect(page.getByLabel('Rahmen um den ganzen Streifen')).toHaveCount(1);

  await cardSheet(page);
  await expect(settings.getByRole('button', { name: 'Satzstreifen' })).toHaveCount(0);
  await expect(page.getByLabel('Rahmen um jede Karte')).toHaveCount(1);
  await expect(page.getByLabel('Rahmen um den ganzen Streifen')).toHaveCount(0);
});

test('the ARASAAC credit fits in the room a grid page leaves it', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Raster' }).click();
  // One card per page, so the last page is full and reaches the paper's edge.
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');

  /*
   * Asked of the page box rather than of the distance from the grid to the foot
   * of the credit. Since the notice is pinned to the bottom of its page that
   * distance simply is the page height, and offsetTop and offsetHeight are
   * whole pixels — it would read a quarter of a millimetre over and mean
   * nothing. What the reservation is for is the two things below: five cards at
   * one per page come to five sheets and not six, and the last of them holds
   * everything on it.
   */
  await expect(page.locator('.preview-frame .ps-page')).toHaveCount(5);
  const spill = await page.locator('.preview-frame .ps-page').last()
    .evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight);
  expect(spill).toBe(0);
});

/*
 * The same room on the narrowest paper this app offers, now that „, erstellt
 * mit" and the address ride on the notice's own line. The collection's name is
 * not on the credit line at all: that is the title's job, and under the title
 * it only said the same thing twice.
 */
test('the credit line names no collection', async ({ page }) => {
  await cardSheet(page);
  await page.getByLabel('Name der Sammlung', { exact: true })
    .fill('Kindergarten Sonnenschein – Morgenkreis und Mittagsrunde');
  await showSheet(page);

  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');

  await expect(page.locator('.preview-frame .ps-page')).toHaveCount(5);
  const spill = await page.locator('.preview-frame .ps-page').last()
    .evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight);
  expect(spill).toBe(0);

  const credit = page.locator('.preview-frame .ps-attribution').first();
  await expect(credit).not.toContainText('Kindergarten');
  await expect(credit).toContainText(', erstellt mit https://bildhaft.lautstark.tech');
});

/*
 * A printout is a stack of paper that looks like every other stack of paper.
 * The name is the one thing that tells this stack from the folder's other
 * twenty, so it has to reach the printable copy and not only the preview.
 */
test('the collection name can head the sheet', async ({ page }) => {
  await page.getByLabel('Name der Sammlung', { exact: true }).fill('Morgenkreis');
  await showSheet(page);

  await expect(page.locator('.preview-frame .ps-title')).toHaveCount(0);

  await openLook(page);
  await page.getByLabel('Titel auf der ersten Seite').check();
  await expect(page.locator('.preview-frame .ps-title')).toHaveText('Morgenkreis');
  await backToPrint(page);
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
  await cardSheet(page);
  await page.getByLabel('Titel auf der ersten Seite').check();
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
  expect(used).toBeLessThanOrEqual(281);
});

/*
 * The sheet used to be one column the browser cut wherever it liked. Only a
 * card grid built pages, so a strip sheet could not show where the paper ended
 * and nothing anywhere could say how much paper a job came to — which is the
 * question somebody standing at a shared printer is actually asking.
 */
test('the preview is cut into pages, and the column counts them', async ({ page }) => {
  const pages = page.locator('.preview-frame .ps-page');
  const meta = page.locator('.print-view .pager__at');

  await expect(pages).toHaveCount(1);
  await expect(meta).toContainText('1 Seite');
  /*
   * A page box is the paper, not the content that happened to land on it — and
   * in the preview it is the whole sheet, margin included, because a preview
   * that showed the margin only at the top of the first page would be saying
   * the second one has none. The printable copy carries the printable area
   * instead — there @page supplies the margin — which is measured in print
   * media by the last test in this file; it has no height at all in this one.
   */
  expect(mm(await pages.first().evaluate((el: HTMLElement) => el.offsetHeight)))
    .toBeCloseTo(297, 0);

  // A forced break.
  await page.getByLabel('Ein Satz pro Seite').check();
  await expect(pages).toHaveCount(2);
  await expect(meta).toContainText('Seite 1 von 2');
  // One plan, applied to both copies: the preview and the printer cannot
  // disagree about where a page ends, because neither worked it out alone.
  await expect(page.locator('#print-root .ps-page')).toHaveCount(2);

  // And one nobody forced: 90mm cards simply stop fitting.
  await cardSheet(page);
  await page.getByLabel('Symbolgröße').fill('90');
  await expect(pages).toHaveCount(3);
  await expect(meta).toContainText('Seite 1 von 3');

  // One page at a time, turned with the arrows rather than scrolled.
  const frame = page.locator('.print-view .preview-frame');
  await expect(page.getByRole('button', { name: 'Vorige Seite' }).first()).toBeDisabled();
  await page.getByRole('button', { name: 'Nächste Seite' }).first().click();
  await expect(meta).toContainText('Seite 2 von 3');
  await expect.poll(() => frame.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Nächste Seite' }).first().click();
  await expect(meta).toContainText('Seite 3 von 3');
  await expect(page.getByRole('button', { name: 'Nächste Seite' }).first()).toBeDisabled();
});

/*
 * ARASAAC's credit is a licence condition, and METACOM's is what makes material
 * lawful to hand out. So it is the footer of every page — a sheet handed on
 * alone carries it too — at the very foot, not under the last strip on a
 * half-empty page, where it reads as something that got left behind.
 */
test('the credit sits at the foot of every page, whatever the layout', async ({ page }) => {
  const foot = () => page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) =>
    [...sheet.querySelectorAll<HTMLElement>('.ps-page')].map((one) => {
      const credit = one.querySelector<HTMLElement>('.ps-attribution');
      if (!credit) return null;
      // The foot of the printable area, not of the box: in the preview a page
      // carries the paper's own margin as padding, and the notice is printed
      // inside that margin like everything else. In whole pixels, which is what
      // offsetTop and offsetHeight are: at 96dpi one is a quarter of a millimetre.
      const pad = parseFloat(getComputedStyle(one).paddingBottom);
      const bottom = credit.getBoundingClientRect().bottom - one.getBoundingClientRect().top;
      const scale = one.getBoundingClientRect().height / one.offsetHeight;
      return Math.round(one.offsetHeight - pad - bottom / scale);
    }));

  // A strip sheet with most of the page still empty.
  await expect.poll(foot).toEqual([expect.any(Number)]);
  expect(Math.abs((await foot())[0]!)).toBeLessThanOrEqual(1);

  // And a grid, where the room it drops into is the band every page reserves
  // so that the notice never costs a sheet of its own.
  await cardSheet(page);
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await expect(page.locator('.preview-frame .ps-page')).toHaveCount(5);

  const grid = await foot();
  expect(grid).toHaveLength(5);
  for (const gap of grid) expect(Math.abs(gap ?? Infinity)).toBeLessThanOrEqual(1);
});

/*
 * A full page is where the foot moved: the last strip on it was let on without
 * the room under it, so the foot sat that much lower than on a page with room
 * to spare — 7 mm under a strip, 3 mm under a Lied's part. The foot is in the
 * same place on every page, full or not.
 */
test('the foot does not move on a full page', async ({ page }) => {
  await showMaterial(page);
  await translateAll(page, [
    'Der Hund spielt im Garten', 'Wir gehen heute schwimmen', 'Die Katze schläft',
    'Ich trinke Wasser', 'Mama kocht Suppe', 'Wir malen ein Bild', 'Papa liest ein Buch',
    'Der Ball ist rot', 'Ich gehe nach Hause', 'Wir spielen draußen',
  ]);
  await showSheet(page);
  await page.getByRole('button', { name: 'A5', exact: true }).click();

  const gaps = await page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) =>
    [...sheet.querySelectorAll<HTMLElement>('.ps-page')].map((one) => {
      const scale = one.getBoundingClientRect().height / one.offsetHeight;
      const foot = one.querySelector<HTMLElement>('.ps-attribution')!.getBoundingClientRect();
      return Math.round((one.getBoundingClientRect().bottom - foot.bottom) / scale);
    }));
  expect(gaps.length).toBeGreaterThan(1);
  for (const gap of gaps) expect(gap).toBe(gaps.at(-1));
});

/*
 * The page boxes are exactly the printable area, which is the one size at which
 * being a hair too tall is fatal: a box a pixel over its page prints as two,
 * and every sheet after it is a blank with a sliver at the top.
 */
test('every page of the printable copy holds inside the paper', async ({ page }) => {
  await cardSheet(page);
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await page.emulateMedia({ media: 'print' });

  const seen = await page.locator('#print-root .ps-sheet').evaluate((sheet: HTMLElement) => {
    const pages = [...sheet.querySelectorAll<HTMLElement>('.ps-page')];
    return {
      count: pages.length,
      overflow: pages.map((p) => p.scrollHeight - p.clientHeight),
      total: sheet.offsetHeight / (96 / 25.4),
    };
  });

  expect(seen.count).toBe(5);
  expect(seen.overflow).toEqual([0, 0, 0, 0, 0]);
  // Five pages of paper and nothing else — no padding, and no sixth sheet.
  expect(seen.total).toBeCloseTo(5 * 281, 0);
});

/*
 * bildhaft makes the PDF itself, from the preview. Without a folder to keep it
 * in, it is downloaded — and it is the preview: the same number of pages, on
 * the same paper, named for the day and the paper.
 */
test('saves the preview as a PDF of the same pages', async ({ page }) => {
  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await expect(page.locator('.print-view .pager__at')).toContainText('Seite');
  await expect(page.locator('.preview-frame .ps-page').first()).toBeVisible();
  const pages = await page.locator('.preview-frame .ps-page').count();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Als PDF speichern' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^.+ \d{4}-\d{2}-\d{2} A5 hoch\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(pages);
  // A5 standing up, in points.
  const size = pdf.getPage(0).getSize();
  expect(size.width).toBeCloseTo(148 * 72 / 25.4, 0);
  expect(size.height).toBeCloseTo(210 * 72 / 25.4, 0);
});

/*
 * A size is typed digit by digit, and „1" on the way to „14" is not a size.
 * Clamped on every keystroke it became 10 and then 104. And the wheel scrolls
 * the column — over a focused number field it used to turn the number.
 */
test('a size can be typed, and scrolling does not change it', async ({ page }) => {
  const size = page.getByLabel('Symbolgröße');
  await size.click();
  await size.press('ControlOrMeta+a');
  await page.keyboard.type('14');
  await expect(size).toHaveValue('14');
  const card = page.locator('.preview-frame .ps-card__img').first();
  await expect.poll(() => card.evaluate((el: HTMLElement) => Math.round(el.offsetWidth / (96 / 25.4)))).toBe(14);

  // Out of range, it is put right on leaving the field, not while typing.
  await size.press('ControlOrMeta+a');
  await page.keyboard.type('5');
  await expect(size).toHaveValue('5');
  await size.press('Tab');
  await expect(size).toHaveValue('10');

  await size.click();
  const box = await size.boundingBox();
  await page.mouse.move(box!.x + 5, box!.y + 5);
  await page.mouse.wheel(0, 120);
  await expect(size).toHaveValue('10');
});

/*
 * The pages small, on the left, say which one is showing: by the arrows and by
 * a press on one of them.
 */
test('the pages on the left follow the page being shown', async ({ page }) => {
  await page.getByLabel('Ein Satz pro Seite').check();
  const thumbs = page.locator('.print-view__thumb');
  await expect(thumbs).toHaveCount(2);
  await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true');

  await thumbs.nth(1).click();
  await expect(page.locator('.print-view .pager__at')).toHaveText('Seite 2 von 2');
  await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Vorige Seite' }).click();
  await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true');
});

/*
 * A Sammlung opens in the view it was left in, on this device: its sheet
 * stays its sheet across another Sammlung and a reload. A new one opens on
 * its material.
 */
test('each Sammlung opens in the view it was left in', async ({ page }) => {
  const view = (name: string) => page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name });
  await expect(view('Drucken')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  await expect(page.locator('.print-view')).toHaveCount(0);

  await page.locator('.sidebar__section--collections .collections__item').nth(1).click();
  await expect(view('Drucken')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.print-view .preview-frame .ps-sheet')).toBeVisible();

  await page.reload();
  await page.locator('.sidebar__section--collections .collections__item').nth(1).click();
  await expect(page.locator('.print-view .preview-frame .ps-sheet')).toBeVisible();
});
