import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { mockArasaac } from './arasaac-mock.ts';
import { backToPrint, cardSheet, openDing, openLook, pickPaper, pickTemplate, showMaterial, showSheet, translateAll, untilKept } from './helpers.ts';

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
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('25');
  await page.getByLabel('Rand', { exact: true }).fill('5');

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
test('names the field a ruler will find, not just the symbol', async ({ page }) => {
  /* The readout is the Symbol menu's first line. */
  const hint = page.locator('.ding__mess');
  const card = page.locator('.preview-frame .ps-card').first();
  const box = async () => card.evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));

  await openDing(page, 'Symbol');
  await expect(hint).toContainText('Karte 46 × 52 mm');
  expect(mm((await box()).w)).toBeCloseTo(46, 0);
  expect(mm((await box()).h)).toBeCloseTo(52, 0);

  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('50');
  await expect(hint).toContainText('Symbol 50 mm');
  await expect(hint).toContainText('Karte 56 × 62 mm');

  // A frame grows the card, so both figures have to grow with it. Checked to
  // the millimetre and no finer, as the readout is: offsetWidth is whole
  // pixels, and the readout rounds to whole millimetres. The frame
  // is the Sammlung's „Gestaltung", the readout the print dialog's.
  await openLook(page);
  await openDing(page, 'Symbol');
  await page.getByLabel('Rahmen um jede Karte').check();
  await backToPrint(page);
  await openDing(page, 'Symbol');
  await expect(hint).toContainText('Karte 60 × 65 mm');
  expect(mm((await box()).w)).toBeCloseTo(60.3, 0);
  expect(mm((await box()).h)).toBeCloseTo(65.4, 0);
});

/*
 * The grid decides the card size instead of the other way round, and the size
 * it lands on is the one thing the settings do not state anywhere.
 */
test('a grid says what size its cells came out', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');
  await showSheet(page);

  await openDing(page, 'Symbol');
  await expect(page.locator('.ding__mess')).toContainText('Karte 63 × 136 mm');
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
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('60');
  await page.getByRole('spinbutton', { name: 'Höhe' }).fill('90');
  await showSheet(page);

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
  await openDing(page, 'Symbol');
  await page.getByLabel('Rand', { exact: true }).fill('12');
  await showSheet(page);
  await expect.poll(symbol).toBeLessThan(roomy);
  expect(mm((await box()).w)).toBeCloseTo(60, 0);
  expect(mm((await box()).h)).toBeCloseTo(90, 0);
});

/* A square card is the usual one, and typing 60 twice is one chance in two to
   mistype it — so an empty height is an answer rather than a missing one. */
test('an empty height means as high as it is wide', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('55');
  await page.getByRole('spinbutton', { name: 'Höhe' }).fill('');
  await page.getByRole('spinbutton', { name: 'Höhe' }).blur();
  await showSheet(page);

  const card = page.locator('.preview-frame .ps-card').first();
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetHeight)))
    .toBeCloseTo(55, 0);
  await openDing(page, 'Symbol');
  await expect(page.getByRole('spinbutton', { name: 'Höhe' })).toHaveAttribute('placeholder', '55');
});

/*
 * Said, not silently worked around. A card bigger than the paper could be shrunk
 * to fit, and then the one number the person came here to fix would be the one
 * number the printout does not honour.
 */
test('says so when the card does not fit the paper', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('60');
  await showSheet(page);
  await expect(page.getByText(/^Symbol \d/)).toBeVisible();

  await openDing(page, 'Symbol');
  await page.getByRole('spinbutton', { name: 'Breite' }).fill('200');
  await showSheet(page);
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
  /* The ⋯ sits in the head, under the print overlay this suite opens — the
     export is an act on the material, so it is done from the material. */
  await showMaterial(page);
  await page.getByRole('button', { name: 'Aktionen für dieses Material' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Material exportieren' }).click();
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

  await pickPaper(page, 'Quer');
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(297, 0);

  // @page is the only thing that turns the actual printer, and it cannot be
  // written from a class — so the rule itself is what has to be checked.
  await expect.poll(() => page.evaluate(() =>
    document.getElementById('print-page-setup')?.textContent ?? '')).toContain('size: 297mm 210mm');
});

test('paper size drives the sheet, the printer rule and the grid together', async ({ page }) => {
  const sheet = page.locator('.preview-frame .ps-sheet');
  const rule = () => page.evaluate(() =>
    document.getElementById('print-page-setup')?.textContent ?? '');

  /* The printer only takes A4: A5 standing up goes two pages across an A4
     lying on its side, each page its own A5 with its margin round it, and a
     mark at the top and the foot where the sheet is folded. No A3. */
  await page.getByRole('button', { name: 'Papier wählen' }).click();
  await expect(page.locator('.paper-pick__pop').getByRole('button', { name: 'A3', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await pickPaper(page, 'A5');
  await expect.poll(async () => mm(await sheet.evaluate((el: HTMLElement) => el.offsetWidth)))
    .toBeCloseTo(297, 0);
  await expect.poll(rule).toContain('size: 297mm 210mm');
  await expect(sheet.locator('.ps-paper--two.ps-paper--side .ps-fold')).toHaveCount(2);
  const half = sheet.locator('.ps-paper--two > .ps-page').first();
  expect(mm(await half.evaluate((el: HTMLElement) => el.offsetWidth))).toBeCloseTo(148, 0);
  expect(mm(await half.evaluate((el: HTMLElement) => el.offsetHeight))).toBeCloseTo(210, 0);

  /*
   * The cards have to follow the paper, not just the sheet around them. Height,
   * not width: a card's width comes from the grid's 1fr columns and so tracks
   * the sheet whatever the paper table says, which makes it useless as evidence.
   * The row height is the one measurement read straight off that table. Cards
   * to cut out are A4 only: the paper asks which way up, not A5.
   */
  await cardSheet(page);
  await page.getByRole('button', { name: 'Papier wählen' }).click();
  await expect(page.locator('.paper-pick__pop').getByRole('button', { name: 'A5', exact: true })).toHaveCount(0);
  await expect(page.locator('.paper-pick__pop').getByRole('button', { name: 'Quer', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');
  await showSheet(page);
  const card = page.locator('.preview-frame .ps-card').first();
  // A4 portrait: 297mm less 10mm at the top and 6mm at the foot, less the room ARASAAC's credit
  // needs, halved.
  await expect.poll(async () => mm(await card.evaluate((el: HTMLElement) => el.offsetHeight)))
    .toBeGreaterThan(130);
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetHeight))).toBeLessThan(140.5);
});

test('a card grid fills the page with exactly the asked-for cells', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('3');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('2');
  await showSheet(page);

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
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetHeight))).toBeCloseTo(135.7, 0);

  // Five distinct symbols across the two sentences fit on one page of six.
  expect(await page.locator('.preview-frame .ps-grid').count()).toBe(1);

  // A page break has to be a real break, not a gap: with more cards than cells
  // the second page starts a new sheet. The page box breaks, not the grid in
  // it — a grid breaking of its own sent the page's foot onto the next sheet.
  await openDing(page, 'Symbol');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);
  await expect(page.locator('.preview-frame .ps-grid')).toHaveCount(2);
  const grid1 = page.locator('.preview-frame .ps-grid').first();
  /* Polled: the sheet is planned again a task after the change, and a grid
     read mid-replan is a node without a page around it yet. */
  await expect.poll(() => grid1.evaluate((el: HTMLElement) => {
    const pageBox = el.closest('.ps-page');
    return pageBox ? getComputedStyle(pageBox).breakAfter : null;
  })).toBe('page');
  expect(await grid1.evaluate((el: HTMLElement) => getComputedStyle(el).breakAfter)).toBe('auto');
});

test('a card frame is drawn inside the cut margin, not on it', async ({ page }) => {
  // Nothing configured: no frame element at all, and the card keeps the size
  // it has always had.
  await expect(page.locator('.preview-frame .ps-card__frame')).toHaveCount(0);
  const card = page.locator('.preview-frame .ps-card').first();
  expect(mm(await card.evaluate((el: HTMLElement) => el.offsetWidth))).toBeCloseTo(46, 0);

  await openLook(page);
  await openDing(page, 'Symbol');
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

  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Karten Gelb' }).click();
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
  await openDing(page, 'Streifen');
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
  const sentence = page.locator('.ding__dep', { has: page.getByLabel('Schriftgröße des Satztexts') });

  await expect.poll(captionBelowRow).toBe(false);
  await openDing(page, 'Streifen');
  await sentence.getByRole('button', { name: 'unten' }).click();
  await expect.poll(captionBelowRow).toBe(true);
  await expect(page.locator('#print-root .ps-sentence').first().locator('.ps-caption')).toHaveClass(/ps-caption--below/);

  // In points, as typed: 72 to the inch, the browser's 96 pixels to it.
  const pt = (el: HTMLElement) => (parseFloat(getComputedStyle(el).fontSize) * 72) / 96;
  await openDing(page, 'Streifen');
  await page.getByLabel('Schriftgröße des Satztexts').fill('14');
  await expect.poll(() => strip.locator('.ps-caption').evaluate(pt)).toBeCloseTo(14, 1);
  // Its own size, not the label's.
  expect(await page.locator('.preview-frame .ps-card__label').first().evaluate(pt)).toBeCloseTo(11, 1);

  await openDing(page, 'Streifen');
  await page.getByLabel('Satztext drucken').uncheck();
  await expect(strip.locator('.ps-caption')).toHaveCount(0);
  await expect(page.getByLabel('Schriftgröße des Satztexts')).toHaveCount(0);

  await openDing(page, 'Symbol');
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
  await openDing(page, 'Streifen');
  await expect(page.getByLabel('Rahmen um den ganzen Streifen')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Raster' })).toHaveCount(0);

  /* A card sheet has no strip and no Streifen-Knopf; its frame row is the
     Symbol-Knopf's. */
  await cardSheet(page);
  await expect(page.locator('.ding__chip[aria-label="Streifen"]')).toHaveCount(0);
  await openDing(page, 'Symbol');
  await expect(page.getByLabel('Rahmen um jede Karte')).toHaveCount(1);
  await expect(page.getByLabel('Rahmen um den ganzen Streifen')).toHaveCount(0);
});

test('the ARASAAC credit fits in the room a grid page leaves it', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  // One card per page, so the last page is full and reaches the paper's edge.
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);

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
 * The same room on the narrowest paper a card sheet has — A4 standing up,
 * cards to cut out having no A5 — now that „, erstellt mit" and the address
 * ride on the notice's own line. The collection's name is not on the credit
 * line at all: that is the title's job, and under the title it only said the
 * same thing twice.
 */
test('the credit line names no collection', async ({ page }) => {
  await cardSheet(page);
  await showMaterial(page);
  await page.getByLabel('Name des Materials', { exact: true })
    .fill('Kindergarten Sonnenschein – Morgenkreis und Mittagsrunde');
  await pickPaper(page, 'Hoch');
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);

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
  await page.getByLabel('Name des Materials', { exact: true }).fill('Morgenkreis');
  await showSheet(page);

  await expect(page.locator('.preview-frame .ps-title')).toHaveCount(0);

  await openLook(page);
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').check();
  await expect(page.locator('.preview-frame .ps-title')).toHaveText('Morgenkreis');
  await backToPrint(page);
  await expect(page.locator('#print-root .ps-title')).toHaveText('Morgenkreis');

  // Once, above everything — not a running header. Two sentences broken onto a
  // page each is the case that would show a second copy if it were one.
  await openDing(page, 'Seite');
  await page.getByLabel('Ein Satz pro Seite').check();
  await expect(page.locator('#print-root .ps-sentence--page')).toHaveCount(1);
  await expect(page.locator('#print-root .ps-title')).toHaveCount(1);
});

/*
 * One Zeile, the same everywhere: Seite and Symbol, then — only where a
 * template has something of its own — a chip that carries its name. The old
 * settings column is gone.
 */
test('the Zeile is one base in one order, then what only the template has', async ({ page }) => {
  await expect(page.locator('.ding__chip')).toHaveText(['Seite', 'Symbol', 'Streifen']);
  await openDing(page, 'Seite');
  await page.getByRole('button', { name: 'Seitenfarbe Grün' }).click();
  await expect(page.locator('#print-root .ps-page--coloured').first()).toBeAttached();
});

/*
 * A Sammlung's print is its own: a new one starts from its template, not from
 * the size the last one was printed at.
 */
test('a new Satzstreifen starts from its template, not from the last one printed', async ({ page }) => {
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('55');
  await untilKept(page, 'symbolSizeMm', 55);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await pickTemplate(page, /^Satzstreifen/);
  await translateAll(page, ['Wir gehen raus']);
  await showSheet(page);
  await openDing(page, 'Symbol');
  await expect(page.getByLabel('Symbolgröße')).toHaveValue('40');
});

/*
 * Until 2026-10-22 a Satzstreifen printed with the household's settings. The
 * first start after that writes them onto each such Sammlung once, so nothing
 * changes on paper.
 */
test('the household\'s print settings move onto the Sammlungen that used them, once', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bildhaft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['settings', 'collections'], 'readwrite');
    const settings = tx.objectStore('settings');
    const app = await new Promise<Record<string, unknown>>((resolve) => {
      const req = settings.get('app');
      req.onsuccess = () => resolve(req.result);
    });
    delete app.printVersion;
    settings.put({ ...app, print: { ...(app.print as object), symbolSizeMm: 55 } }, 'app');
    const collections = tx.objectStore('collections');
    const all = await new Promise<Record<string, unknown>[]>((resolve) => {
      const req = collections.getAll();
      req.onsuccess = () => resolve(req.result);
    });
    // A colour the household had for a Tafel, sitting unseen in this one's print.
    for (const one of all) { one.print = { pageColour: '#a9cbec' }; collections.put(one); }
    await new Promise((resolve) => { tx.oncomplete = resolve; });
    db.close();
  });
  await page.reload();
  await untilKept(page, 'symbolSizeMm', 55);
  await showSheet(page);
  await openDing(page, 'Symbol');
  await expect(page.getByLabel('Symbolgröße')).toHaveValue('55');
  await openDing(page, 'Seite');
  await expect(page.getByRole('button', { name: 'Seitenfarbe: Kein' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#print-root .ps-page--coloured')).toHaveCount(0);
});

/*
 * The title is written in Bearbeiten, under the head: it follows the name
 * until other words are typed, and the print view only says whether and
 * where. „Jede Seite" puts it over every page; „Erste Seite" over the first.
 */
test('the title is written in Bearbeiten and prints over the first or every page', async ({ page }) => {
  await page.getByLabel('Name des Materials', { exact: true }).fill('Morgenkreis – Gruppe Igel');
  await openDing(page, 'Seite');
  await page.getByLabel('Ein Satz pro Seite').check();
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').check();
  const titles = page.locator('#print-root .ps-title');
  await expect(titles).toHaveText(['Morgenkreis – Gruppe Igel']);

  // Its own words, typed in Bearbeiten; the print view has no field for them.
  await showMaterial(page);
  const words = page.getByLabel('Titel auf dem Papier');
  await words.fill('Morgenkreis');
  await words.press('Enter');
  await showSheet(page);
  await expect(page.locator('.print-dock').getByLabel('Titel auf dem Papier')).toHaveCount(0);
  await expect(titles).toHaveText(['Morgenkreis']);

  // Over every page: two sentences, a page each, a title on both.
  await openDing(page, 'Seite');
  await page.getByRole('button', { name: 'Jede Seite', exact: true }).click();
  await expect(titles).toHaveText(['Morgenkreis', 'Morgenkreis']);
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').uncheck();
  await expect(titles).toHaveCount(0);

  // Switched on again it is where it was — over every page — as a label keeps
  // above or below. And back to the name, with whatever the name becomes.
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').check();
  await showMaterial(page);
  // Emptied, the title follows the name again — there is no × to press.
  await page.getByLabel('Titel auf dem Papier').fill('');
  await page.getByLabel('Titel auf dem Papier').press('Enter');
  await page.getByLabel('Name des Materials', { exact: true }).fill('Abschlusskreis');
  await showSheet(page);
  await expect(titles).toHaveText(['Abschlusskreis', 'Abschlusskreis']);
});

/*
 * A symbol for the title, chosen in the picker every field has: it prints
 * before the words, and it is no row of the material.
 */
test('a title symbol prints before the title and is no row', async ({ page }) => {
  await showMaterial(page);
  await expect(page.locator('.rows .row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Symbol zum Titel hinzufügen' }).click();
  await page.getByLabel('Symbol suchen').fill('Apfel');
  await page.locator('.picker__item').first().click();
  await expect(page.getByRole('button', { name: 'Symbol im Titel ändern' }).locator('img')).toBeVisible();
  await expect(page.locator('.rows .row')).toHaveCount(2);
  await expect(page.locator('.collection-head')).toContainText('2 Zeilen');

  await showSheet(page);
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').check();
  await expect(page.locator('.preview-frame .ps-title .ps-title__pic img')).toBeVisible();
  await expect(page.locator('#print-root .ps-sentence')).toHaveCount(2);
});

/*
 * The heading has to be paid for out of the cards, the way the credit block is.
 * A grid page is exactly as tall as the paper, so a heading the grid did not
 * know about pushes its bottom row onto a sheet of its own.
 */
test('a headed grid page takes its room from the cards, not from the paper', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').check();
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  // One card per page, so the first page is full and reaches the paper's edge.
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);

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
 * The same room, for a heading somebody made bigger and underlined: what the
 * grid gives up has to be measured from the heading as it is set, not from
 * the 12 pt one it started as.
 */
test('a big underlined heading still takes its room from the cards', async ({ page }) => {
  await cardSheet(page);
  await showMaterial(page);
  // Two lines at 30 pt, the most the room is reserved for.
  await page.getByLabel('Name des Materials', { exact: true }).fill('Kindergarten Sonnenschein – Morgenkreis');
  await openDing(page, 'Seite');
  await page.getByLabel('Titel drucken').check();
  await page.getByRole('spinbutton', { name: 'Schriftgröße', exact: true }).fill('30');
  await openDing(page, 'Seite');
  await page.getByLabel('Linie darunter').check();
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);

  const sheet = page.locator('.preview-frame .ps-sheet');
  await expect(sheet.locator('.ps-title')).toHaveCSS('font-size', '40px');
  await expect(sheet.locator('.ps-title')).toHaveCSS('border-bottom-style', 'solid');
  await expect(sheet.locator('.ps-title')).toHaveText('Kindergarten Sonnenschein – Morgenkreis');
  // The grid ends where the credits under it begin, not inside them: they have
  // their room reserved too, and a heading must not spend it.
  const overlap = await sheet.evaluate((root: HTMLElement) => {
    const grid = root.querySelector<HTMLElement>('.ps-page .ps-grid')!.getBoundingClientRect();
    const foot = root.querySelector<HTMLElement>('.ps-page .ps-foot')!.getBoundingClientRect();
    const scale = root.getBoundingClientRect().width / root.offsetWidth;
    return (grid.bottom - foot.top) / scale / (96 / 25.4);
  });
  expect(overlap).toBeLessThanOrEqual(0);
});

/*
 * The sheet used to be one column the browser cut wherever it liked. Only a
 * card grid built pages, so a strip sheet could not show where the paper ended
 * and nothing anywhere could say how much paper a job came to — which is the
 * question somebody standing at a shared printer is actually asking.
 */
test('the preview is cut into pages, and the column counts them', async ({ page }) => {
  const pages = page.locator('.preview-frame .ps-page');
  /* The count lives in the paper pill now: „A4 hoch · 3 Seiten". */
  const meta = page.getByRole('button', { name: 'Papier wählen' });

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
  await openDing(page, 'Seite');
  await page.getByLabel('Ein Satz pro Seite').check();
  await expect(pages).toHaveCount(2);
  await expect(meta).toContainText('2 Seiten');
  // One plan, applied to both copies: the preview and the printer cannot
  // disagree about where a page ends, because neither worked it out alone.
  await expect(page.locator('#print-root .ps-page')).toHaveCount(2);

  // And one nobody forced: 90mm cards simply stop fitting.
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('90');
  await showSheet(page);
  await expect(pages).toHaveCount(3);
  await expect(meta).toContainText('3 Seiten');

  // Every page under the one before, like a stack of paper: nothing to turn.
  const tops = await pages.evaluateAll((all: HTMLElement[]) => all.map((el) => el.offsetTop));
  expect(tops[1]).toBeGreaterThan(tops[0]!);
  expect(tops[2]).toBeGreaterThan(tops[1]!);
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
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);
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
  await pickPaper(page, 'A5');

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
 * A strip taller than its page was one block all the same: it ran out of its
 * page box, over the next page and under that page's cards, its foot with it.
 * It goes on over as many pages as it needs, in whole lines, its sentence over
 * the first of them and every symbol on paper once.
 */
test('a strip too tall for one page goes on over the next, in whole lines', async ({ page }) => {
  await showMaterial(page);
  await translateAll(page, ['Morgen fahren wir mit dem Zug zu Oma und Opa in den Garten am See']);
  await showSheet(page);
  const cards = page.locator('.preview-frame .ps-card');
  // Counted on A4 at 40mm, where every strip still fits its page whole.
  const symbols = await cards.count();
  await pickPaper(page, 'A5');
  await pickPaper(page, 'Quer');
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('50');

  const pages = page.locator('.preview-frame .ps-page');
  await expect.poll(() => pages.count()).toBeGreaterThan(2);
  const seen = await page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) =>
    [...sheet.querySelectorAll<HTMLElement>('.ps-page')].map((one) => {
      const box = one.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(one).paddingBottom) * (box.height / one.offsetHeight);
      const bottom = Math.max(...[...one.children].map((child) => child.getBoundingClientRect().bottom));
      return { over: Math.round(bottom - (box.bottom - pad)), captions: one.querySelectorAll('.ps-caption').length };
    }));
  for (const one of seen) expect(one.over).toBeLessThanOrEqual(1);
  expect(seen.map((one) => one.captions).reduce((a, b) => a + b)).toBe(3);
  // The two sentences of the beforeEach and this one, every symbol once.
  await expect(cards).toHaveCount(symbols);
});

/*
 * The page boxes are exactly the printable area, which is the one size at which
 * being a hair too tall is fatal: a box a pixel over its page prints as two,
 * and every sheet after it is a blank with a sliver at the top.
 */
test('every page of the printable copy holds inside the paper', async ({ page }) => {
  await cardSheet(page);
  await openDing(page, 'Symbol');
  await page.getByRole('button', { name: 'Raster' }).click();
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await showSheet(page);
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
 * On A5 the printer still gets A4: two pages to a sheet, each sheet exactly
 * the paper, its pages inside it whole. A sheet a hair too tall would print
 * as two, and the half after it on a page of its own.
 */
test('two A5 pages share each A4 of the printable copy', async ({ page }) => {
  await showMaterial(page);
  await translateAll(page, ['Der Hund spielt im Garten', 'Die Katze schläft']);
  await showSheet(page);
  await pickPaper(page, 'A5');
  await openDing(page, 'Seite');
  await page.getByLabel('Ein Satz pro Seite').check();
  await expect(page.getByRole('button', { name: 'Papier wählen' })).toContainText('2 pro A4 · 2 Blatt');
  await page.emulateMedia({ media: 'print' });

  const seen = await page.locator('#print-root .ps-sheet').evaluate((sheet: HTMLElement) => {
    const mm = (px: number) => px / (96 / 25.4);
    const papers = [...sheet.querySelectorAll<HTMLElement>(':scope > .ps-paper')];
    return {
      papers: papers.map((paper) => ({
        w: mm(paper.offsetWidth), h: mm(paper.offsetHeight),
        pages: paper.querySelectorAll('.ps-page').length,
        folds: paper.querySelectorAll('.ps-fold').length,
      })),
      overflow: [...sheet.querySelectorAll<HTMLElement>('.ps-page')].map((one) => one.scrollHeight - one.clientHeight),
      total: mm(sheet.offsetHeight),
    };
  });
  // Four strips, one a page: two A4 lying on their side, two A5 standing up on each.
  expect(seen.papers.map((paper) => paper.pages)).toEqual([2, 2]);
  for (const paper of seen.papers) {
    expect(paper.w).toBeCloseTo(297, 0);
    expect(paper.h).toBeCloseTo(210, 0);
    expect(paper.folds).toBe(2);
  }
  expect(seen.overflow.every((over) => over === 0)).toBe(true);
  expect(seen.total).toBeCloseTo(2 * 210, 0);
});

/*
 * bildhaft makes the PDF itself, from the preview. Without a folder to keep it
 * in, it is downloaded — and it is the preview: the same number of pages, on
 * the same paper, named for the day and the paper.
 */
test('saves the preview as a PDF of the same sheets', async ({ page }) => {
  await pickPaper(page, 'A5');
  await expect(page.getByRole('button', { name: 'Papier wählen' })).toContainText('Blatt');
  await expect(page.locator('.preview-frame .ps-paper').first()).toBeVisible();
  const pages = await page.locator('.preview-frame .ps-paper').count();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Als PDF speichern' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^.+ \d{4}-\d{2}-\d{2} A5 hoch\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(pages);
  // A5 standing up comes out two to an A4 lying on its side, in points.
  const size = pdf.getPage(0).getSize();
  expect(size.width).toBeCloseTo(297 * 72 / 25.4, 0);
  expect(size.height).toBeCloseTo(210 * 72 / 25.4, 0);
});

/*
 * A size is typed digit by digit, and „1" on the way to „14" is not a size.
 * Clamped on every keystroke it became 10 and then 104. And the wheel scrolls
 * the column — over a focused number field it used to turn the number.
 */
test('a size can be typed, and scrolling does not change it', async ({ page }) => {
  await openDing(page, 'Symbol');
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
 * The sheet stands beside the material by default and stays through a switch
 * and a reload; folded, it stays folded. Only a material with nothing to
 * print has none.
 */
test('the sheet is there by default and survives a switch and a reload', async ({ page }) => {
  await expect(page.locator('.print-dock')).toBeVisible();

  await page.locator('.sidebar__section--collections .collections__item').nth(0).click();
  await expect(page.locator('.print-dock .ps-sheet')).toBeVisible();

  await page.reload();
  await expect(page.locator('.print-dock .ps-sheet')).toBeVisible();

  // Nothing to print, nothing beside it.
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await expect(page.locator('.print-dock')).toHaveCount(0);

  // Folded stays folded, across a reload too.
  await page.locator('.sidebar__section--collections .collections__item').nth(1).click();
  await page.locator('.print-view__tool[aria-label="Vorschau einklappen"]').click();
  await expect(page.locator('.print-dock--mini')).toBeVisible();
  await page.reload();
  await expect(page.locator('.print-dock--mini')).toBeVisible();
  await page.locator('.print-dock__peek').click();
  await expect(page.locator('.print-dock--mini')).toHaveCount(0);
});

/*
 * The panel is narrow and fixed; reading happens in the large preview, opened
 * by pressing anywhere on the stacked pages. A zoom, not a place to be: Esc
 * puts it away, and it is not kept across a switch of material.
 */
test('the pages pressed open the large preview, and Esc puts it away', async ({ page }) => {
  await page.getByRole('button', { name: 'Große Druckvorschau öffnen' }).click();
  await expect(page.locator('.print-dock--big')).toBeVisible();
  await expect(page.locator('.print-dock--big .ps-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.print-dock--big')).toHaveCount(0);
  await expect(page.locator('.print-dock .ps-sheet')).toBeVisible();

  // Its ✕ and the dimmed edge are the other ways out.
  await page.getByRole('button', { name: 'Große Druckvorschau öffnen' }).click();
  await page.getByRole('button', { name: 'Große Vorschau schließen' }).click();
  await expect(page.locator('.print-dock--big')).toHaveCount(0);
  await page.getByRole('button', { name: 'Große Druckvorschau öffnen' }).click();
  await page.locator('.print-dock--big').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('.print-dock--big')).toHaveCount(0);
});
