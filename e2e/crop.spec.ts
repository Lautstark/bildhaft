import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

/**
 * Cutting a picture of the user's own down to a square before it is stored.
 *
 * Every box bildhaft shows a symbol in is square — 68px in a row, 82px in the
 * picker, 40mm on paper — and all of them fit with `object-fit: contain`, so a
 * photograph has always worked and has never filled its card.
 *
 * ## The fixture is readable
 *
 * 24x12, striped: columns 0-5 red, 6-17 green, 18-23 blue. The largest centred
 * square is exactly the green block, so which square was kept can be read off
 * one pixel rather than inferred from a size. That is the point — a test that
 * only asserted "12 by 12" would pass just as happily on a square taken from
 * the wrong corner, or on a picture squashed to fit rather than cut.
 */

/** 24x12, red | green | blue in sixths, twelfths and sixths. */
const WIDE = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAIAAAD3UuoiAAAAIElEQVR4nGO4pqGBhjQW2BBGbifQEMOoQaMGjRqEzyAAgQA8MFUeC2oAAAAASUVORK5CYII=';
/** 3x3 green, the already-square case. The same picture ownimage.spec.ts uses. */
const SQUARE = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAD0lEQVR4nGNg+M8ARVhYAIaXCPjDmz7KAAAAAElFTkSuQmCC';

const RED = [214, 40, 40];
const GREEN = [40, 160, 60];

async function attach(page: Page, data: string, name = 'Bente.png'): Promise<void> {
  await page.locator('.picker__own input[type=file]').setInputFiles({
    name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64'),
  });
}

const crop = (page: Page) => page.locator('.crop');
const dropCrop = (page: Page) => page.getByRole('button', { name: 'Zuschneiden abbrechen' });

/* Keeping the square is the footer's Fertig and nothing else — the crop has no
 * confirming button of its own, because the dialog already had one. */
const keepCrop = (page: Page) => page.getByRole('button', { name: 'Fertig' }).click();

/** The picture the third slot of the first row is drawing. */
const kept = (page: Page) => page.locator('.row').first().locator('.slot').nth(2).locator('img');

/**
 * One pixel out of a picture that is on screen, as [r, g, b].
 *
 * Read off the element rather than off the stored bytes: this is the picture a
 * card would actually be printed from, at the end of the whole path — canvas,
 * PNG, IndexedDB, blob URL and back.
 */
async function pixelAt(image: Locator, x: number, y: number): Promise<number[]> {
  return image.evaluate((element: HTMLImageElement, [atX, atY]) => {
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d canvas');
    context.drawImage(element, 0, 0);
    // Negative counts back from the far edge, so a test can name the last column
    // without first asking how many there are.
    const { data } = context.getImageData(
      atX < 0 ? element.naturalWidth + atX : atX,
      atY < 0 ? element.naturalHeight + atY : atY, 1, 1);
    return [data[0], data[1], data[2]];
  }, [x, y] as const);
}

/** A sentence, with the picker open on its third field. */
async function openPicker(page: Page): Promise<void> {
  await translate(page, 'Ich möchte einen Apfel essen');
  await page.locator('.row').first().locator('.slot').nth(2).click();
}

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('a square picture is kept as it is, with nothing to answer', async ({ page }) => {
  /*
   * The guard on the step itself. A crop over a square picture would ask for a
   * decision the picture has already made, so it is not offered and the file
   * goes to the database as it did before any of this existed — original bytes
   * and all, which is what keeps a photograph out of a needless re-encode.
   */
  await openPicker(page);
  await attach(page, SQUARE);

  await expect(crop(page)).toHaveCount(0);
  // Straight through: the dialog settles on the file, the way it always did.
  await expect(kept(page)).toHaveJSProperty('naturalWidth', 3);
});

test('a wide picture opens its square, and cancelling costs nothing', async ({ page }) => {
  /*
   * Nothing is written until the press that keeps a square, so a cancel leaves
   * the field exactly as it was found — here, still showing the ARASAAC symbol
   * the sentence resolved to.
   *
   * The dialog staying open is the change: it used to settle on the file alone.
   * The rest of it going away for the duration is asserted with it, because a
   * live grid of symbols under an open crop is a press that throws the crop
   * away without saying so.
   */
  await openPicker(page);
  await attach(page, WIDE);

  await expect(crop(page)).toBeVisible();
  await expect(page.locator('.picker__grid')).toBeHidden();
  await expect(page.getByLabel('Symbol suchen')).toBeHidden();

  await dropCrop(page).click();

  await expect(crop(page)).toHaveCount(0);
  await expect(page.locator('.picker__grid')).toBeVisible();
  await expect(page.getByLabel('Symbol suchen')).toBeVisible();

  await keepCrop(page);
  // 1 is the ARASAAC mock, so the slot never took a picture of its own.
  await expect(kept(page)).toHaveJSProperty('naturalWidth', 1);
});

test('the ✕ drops the square, because that is what ✕ means', async ({ page }) => {
  /* The other side of Fertig, and the line this dialog has always drawn: a
   * press that settles it keeps what is in it, a dismissal says nothing
   * happened. Nothing has been written by the time this runs, so the field is
   * left showing the symbol the sentence resolved to. */
  await openPicker(page);
  await attach(page, WIDE);
  await expect(crop(page)).toBeVisible();

  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  // Asserted, or the rest of this test passes just as well on a click that hit
  // nothing: the field shows the ARASAAC mock either way.
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(kept(page)).toHaveJSProperty('naturalWidth', 1);
});

test('the square it opens on is the middle of the picture', async ({ page }) => {
  await openPicker(page);
  await attach(page, WIDE);
  await keepCrop(page);

  const image = kept(page);
  await expect(image).toHaveJSProperty('naturalWidth', 12);
  await expect(image).toHaveJSProperty('naturalHeight', 12);
  /*
   * At the picture's own resolution and no smaller. print.css is explicit that
   * nothing is downscaled before printing, so unlike the same step in vorlaut
   * there is no tile size to cap at — the square is as many pixels as it was.
   *
   * Both edges green, which only the middle twelve columns are. A square taken
   * from either end would have red or blue in it; a picture squashed to fit
   * rather than cut would have all three.
   */
  expect(await pixelAt(image, 0, 6)).toEqual(GREEN);
  expect(await pixelAt(image, -1, 6)).toEqual(GREEN);
});

test('dragging the picture moves what is kept, the other way', async ({ page }) => {
  /*
   * The drag is the one place a screen pixel has to be turned into a source
   * pixel, against a box that does not exist until the dialog is laid out.
   *
   * The direction is what earns the assertion. Dragging the picture right shows
   * more of its left side, so the square being kept moves *left* — one sign in
   * one line, and getting it backwards looks fine in a still.
   */
  await openPicker(page);
  await attach(page, WIDE);

  const at = await crop(page).boundingBox();
  if (!at) throw new Error('the crop has no box to drag in');
  const midY = at.y + at.height / 2;
  await page.mouse.move(at.x + at.width / 2, midY);
  await page.mouse.down();
  // Past the edge on purpose, so the clamp does the stopping rather than the
  // arithmetic happening to land there.
  await page.mouse.move(at.x + at.width, midY, { steps: 8 });
  await page.mouse.up();

  await keepCrop(page);

  const image = kept(page);
  await expect(image).toHaveJSProperty('naturalWidth', 12);
  // Hard against the left edge: the first six columns are the red stripe.
  expect(await pixelAt(image, 0, 6)).toEqual(RED);
  expect(await pixelAt(image, -1, 6)).toEqual(GREEN);
});

test('the arrow keys move it too, and stop at the edge', async ({ page }) => {
  /*
   * The keyboard is the only way to move the square without a pointer. Twenty
   * presses to travel six pixels is deliberately far too many: what that buys
   * is the clamp, so the last fourteen have to do nothing at all rather than
   * walk a green edge off into blank canvas.
   */
  await openPicker(page);
  await attach(page, WIDE);

  for (let nudge = 0; nudge < 20; nudge++) await crop(page).press('ArrowLeft');
  await keepCrop(page);

  const image = kept(page);
  await expect(image).toHaveJSProperty('naturalWidth', 12);
  expect(await pixelAt(image, 0, 6)).toEqual(RED);
});

test('Enter keeps the square too, the way it means Fertig everywhere else',
  async ({ page }) => {
  /*
   * The keyboard half of the button above. Enter is Fertig throughout this
   * dialog, and while a square is being chosen Fertig is that square — left
   * alone it settled the field on whatever it had before, which is the crop
   * thrown away by the key that everywhere else means yes.
   */
  await openPicker(page);
  await attach(page, WIDE);
  await crop(page).press('Enter');

  const image = kept(page);
  await expect(image).toHaveJSProperty('naturalWidth', 12);
  expect(await pixelAt(image, 0, 6)).toEqual(GREEN);
});

test('the slider takes a smaller square', async ({ page }) => {
  /*
   * Zoom is a shrinking square rather than a growing picture, and it shrinks
   * about its own centre — a corner would send whatever had just been centred
   * sliding away, so the slider would undo every drag before it. Both are one
   * number here: at twice in the square is six source pixels rather than
   * twelve, and still wholly inside the green stripe it was centred on.
   */
  await openPicker(page);
  await attach(page, WIDE);

  await page.locator('.crop__zoom').fill('200');
  await keepCrop(page);

  const image = kept(page);
  await expect(image).toHaveJSProperty('naturalWidth', 6);
  await expect(image).toHaveJSProperty('naturalHeight', 6);
  expect(await pixelAt(image, 0, 3)).toEqual(GREEN);
  expect(await pixelAt(image, -1, 3)).toEqual(GREEN);
});
