import { expect, test } from '@playwright/test';
import { mockArasaac, readSentences } from './arasaac-mock.ts';
import { pickTemplate, showMaterial, showSheet } from './helpers.ts';

/**
 * Ein Spiel is built row by row, as it prints: the „+" tile takes a picture
 * through the picker, „+ Platzhalter" sets a gap only where one is asked for,
 * „+ Zeile" begins the next row — no typing box, nothing guessed. Dragging
 * orders cells within a row and rows within the game, a Platzhalter into the
 * middle of a row included.
 *
 * On paper, always one sheet, A4 across: the Ablage at the left edge — one
 * velcro dot per card of the game, in exactly the game's rows, no echo of any
 * answer — the game at the right, a fence of accent dots between them. The
 * cut cards follow on a sheet of their own, two millimetres a side smaller
 * than the fields (the laminate's seam), the symbols the one size on both.
 */
test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Spiel/);
});

/** Adds a cell through the „+" tile of the given row scope, picking `term`. */
async function pick(page: import('@playwright/test').Page, scope: ReturnType<import('@playwright/test').Page['locator']>, label: string, term: string): Promise<void> {
  await scope.getByRole('button', { name: label }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByLabel('Symbol suchen');
  await search.fill(term);
  await search.press('Enter');
  await page.locator('.picker__item', { hasText: term }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('ein Spiel baut sich Zeile für Zeile, und druckt Blatt und Kartenbogen', async ({ page }) => {
  // An empty Spiel already shows its first row: the two tiles, no typing box.
  const rows = page.locator('.game__row');
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('button', { name: '+ Bild' })).toBeVisible();
  await expect(rows.first().getByRole('button', { name: '+ Platzhalter' })).toBeVisible();

  // A tile closed without a choice leaves no card behind.
  await rows.first().getByRole('button', { name: '+ Bild' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.game .word:not(.word--add)')).toHaveCount(0);
  await expect.poll(async () => (await readSentences(page)).length).toBe(0);

  // Row 1: a printed picture, then a Platzhalter — the gap only where asked.
  await pick(page, rows.first(), '+ Bild', 'Schuh');
  await expect(rows.first().locator('.word__name')).toHaveText(['Schuh']);
  await pick(page, rows.first(), '+ Platzhalter', 'Socke');
  await expect(rows.first().locator('.luecke .word__name')).toHaveText('Socke');

  // Row 2 begins with „+ Zeile", and builds the same way.
  await page.getByRole('button', { name: '+ Zeile' }).click();
  await expect(rows).toHaveCount(2);
  const second = rows.nth(1);
  await pick(page, second, '+ Bild', 'Regen');
  await pick(page, second, '+ Platzhalter', 'Banane');
  await expect(second.locator('.word__name')).toHaveText(['Regen', 'Banane']);

  // A cell dragged within its row: the Platzhalter moves to the front.
  const cells = rows.first().locator('.game__cell');
  await cells.nth(1).dragTo(cells.nth(0));
  await expect(rows.first().locator('.game__cell .word__name')).toHaveText(['Socke', 'Schuh']);

  // A row dragged over another: the rows change places.
  await second.dragTo(rows.first());
  await expect(rows.first().locator('.word__name')).toHaveText(['Regen', 'Banane']);

  // One sheet, A4 across: the Ablage holds one dot per card of the game,
  // the fence stands between the zones, and the rows print their cells in
  // the order they were put — the Platzhalter at the front included.
  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('size: 297mm 210mm');
  const board = sheet.locator('.ps-spiel');
  await expect(board.locator('.ps-spiel__lager .ps-talk__field')).toHaveCount(2);
  await expect(board.locator('.ps-spiel__zaun')).toBeVisible();
  await expect(board.locator('.ps-spiel__zelle')).toHaveCount(2);
  await expect(board.locator('.ps-talk__field--free')).toHaveCount(2);
  await expect(board.locator('.ps-spiel__bild .ps-spiel__wort')).toHaveText(['Regen', 'Schuh']);
  expect(await board.locator('.ps-spiel__zelle').nth(1).evaluate((row) =>
    [...row.children].map((cell) => cell.classList.contains('ps-talk__field') ? 'frei' : 'bild')))
    .toEqual(['frei', 'bild']);

  // The cut cards on a sheet of their own, the laminate's seam smaller than
  // the fields, the symbol the one size on both.
  const cut = sheet.locator('.ps-spiel-cut');
  await expect(cut.locator('.ps-talk__card .ps-spiel__wort')).toHaveText(['Banane', 'Socke']);
  const sizes = await page.evaluate(() => {
    const board = document.querySelector('.preview-frame .ps-spiel') as HTMLElement;
    const cut = document.querySelector('.preview-frame .ps-spiel-cut') as HTMLElement;
    const mm = (node: HTMLElement, name: string): number => parseFloat(getComputedStyle(node).getPropertyValue(name));
    return {
      feld: mm(board, '--talk-w'), karte: mm(cut, '--talk-w'),
      symbolBlatt: mm(board, '--sym'), symbolBogen: mm(cut, '--sym'),
    };
  });
  expect(sizes.karte).toBeCloseTo(sizes.feld - 4, 1);
  expect(sizes.symbolBogen).toBeCloseTo(sizes.symbolBlatt, 3);

  // An empty row is being built, not designed: it does not print.
  await showMaterial(page);
  await page.getByRole('button', { name: '+ Zeile' }).click();
  await expect(rows).toHaveCount(3);
  await expect(board.locator('.ps-spiel__zelle')).toHaveCount(2);

  // A row taken out goes with its cards.
  await rows.nth(0).getByRole('button', { name: 'Zeile 1 löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(rows).toHaveCount(2);
  await expect.poll(async () => (await readSentences(page)).map((row) => row.rawInput ||
    row.slots[0]?.sourceToken)).not.toContain('Regen');
});

test('das Spiel-Menü zeigt das Maß und hält die zwei Farben', async ({ page }) => {
  const rows = page.locator('.game__row');
  await pick(page, rows.first(), '+ Bild', 'Apfel');
  await pick(page, rows.first(), '+ Platzhalter', 'Banane');
  await showSheet(page);

  // The symbol's size is the sheet's own answer, shown as a fact.
  const chip = page.locator('.ding__chip[aria-label="Symbol"]');
  await chip.click();
  await expect(page.getByText(/folgt dem Blatt/)).toBeVisible();
  await expect(page.getByLabel('Symbolgröße')).toHaveCount(0);

  // The Spiel menu holds the board's ground and the accent that frames the
  // printed cards — picking an accent recolours the frame on the sheet.
  await page.locator('.ding__chip[aria-label="Spiel"]').click();
  await page.getByRole('button', { name: 'Akzent Blau' }).click();
  await expect.poll(() => page.evaluate(() => {
    const bild = document.querySelector('.preview-frame .ps-spiel__bild');
    return bild ? getComputedStyle(bild).borderColor : '';
  })).toBe('rgb(63, 136, 224)');
  await page.getByRole('button', { name: 'Spielfeld: Kein' }).click();
  await expect.poll(() => page.evaluate(() => {
    const zelle = document.querySelector('.preview-frame .ps-spiel__zelle');
    return zelle ? getComputedStyle(zelle).backgroundColor : '';
  })).toBe('rgba(0, 0, 0, 0)');
});
