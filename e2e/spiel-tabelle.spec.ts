import { expect, test } from '@playwright/test';
import { mockArasaac, readSentences } from './arasaac-mock.ts';
import { closePicker, pickTemplate, showMaterial, showSheet } from './helpers.ts';

/**
 * Ein Spiel · Tabelle — Zeile × Spalte, her pick of 2026-10-30: a template
 * tile of its own beside „Spiel · Reihen", both in the Spiel group. It is
 * built as it prints: the corner empty, „+ Spalte" brings a column head and
 * a place under it in every row, „+ Zeile" a row head and a place under
 * every column, and each place's „+ Platzhalter" takes the card that is
 * laid where the two meet. On paper the Ablage and the fence of every Spiel,
 * then the table as one raster in the accent's lines.
 */
test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Spiel · Tabelle/);
});

/** Presses a „+" in `scope` and picks `term` in the picker it opens. */
async function pick(page: import('@playwright/test').Page, scope: ReturnType<import('@playwright/test').Page['locator']>, label: string, term: string): Promise<void> {
  await scope.getByRole('button', { name: label }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByLabel('Symbol suchen');
  await search.fill(term);
  await search.press('Enter');
  await page.locator('.picker__item', { hasText: term }).first().click();
  await closePicker(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const words = (scope: ReturnType<import('@playwright/test').Page['locator']>) => scope.locator('.word__name');

test('eine Tabelle baut sich Spalte für Spalte und Zeile für Zeile, und druckt als ein Raster', async ({ page }) => {
  const table = page.locator('.game-table');
  // Its own name, in the Spiel group; an empty Tabelle shows its corner and „+ Spalte".
  await expect(page.locator('.collection-head__other')).toContainText('Spiel · Tabelle');
  await expect(table.locator('.game-table__ecke')).toBeVisible();
  await expect(page.locator('.game__row')).toHaveCount(0);

  // A column closed without a choice leaves nothing behind.
  await table.getByRole('button', { name: '+ Spalte' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(table.locator('.game-table__kopf')).toHaveCount(0);
  await expect.poll(async () => (await readSentences(page)).length).toBe(0);

  // Two columns, two rows: the heads along the top and down the left.
  await pick(page, table, '+ Spalte', 'Pullover');
  await pick(page, table, '+ Spalte', 'Tasse');
  await pick(page, page.locator('main'), '+ Zeile', 'Rot');
  await pick(page, page.locator('main'), '+ Zeile', 'Blau');
  await expect(words(table.locator('.game-table__kopf'))).toHaveText(['Pullover', 'Tasse']);
  await expect(words(table.locator('.game-table__zeilenkopf'))).toHaveText(['Rot', 'Blau']);

  // Every place under a column waits with its „+ Platzhalter" until its card is picked.
  const felder = table.locator('.game-table__feld');
  await expect(felder).toHaveCount(4);
  await pick(page, felder.nth(0), '+ Platzhalter', 'Rotpulli');
  await pick(page, felder.nth(1), '+ Platzhalter', 'Rottasse');
  await pick(page, felder.nth(2), '+ Platzhalter', 'Blaupulli');
  await expect(words(felder.locator('.luecke'))).toHaveText(['Rotpulli', 'Rottasse', 'Blaupulli']);
  await expect(felder.nth(3).getByRole('button', { name: '+ Platzhalter' })).toBeVisible();

  // A column dragged by its head takes its cards along in every row.
  const kopf = table.locator('.game-table__kopf');
  await kopf.nth(1).dragTo(kopf.nth(0));
  await expect(words(kopf)).toHaveText(['Tasse', 'Pullover']);
  await expect(words(felder.nth(0))).toHaveText('Rottasse');
  await expect(felder.nth(2).getByRole('button', { name: '+ Platzhalter' })).toBeVisible();
  await expect(words(felder.nth(3))).toHaveText('Blaupulli');

  // A row dragged by its head: the head row stays on top.
  const zeilenkopf = table.locator('.game-table__zeilenkopf');
  await zeilenkopf.nth(1).dragTo(zeilenkopf.nth(0));
  await expect(words(zeilenkopf)).toHaveText(['Blau', 'Rot']);
  await expect(words(kopf)).toHaveText(['Tasse', 'Pullover']);

  // On paper: the Ablage holds a dot for every card laid, the fence stands
  // between, and the table is the corner, the heads and a field per place.
  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('size: 297mm 210mm');
  const board = sheet.locator('.ps-spiel--tabelle');
  await expect(board.locator('.ps-spiel__lager .ps-talk__field')).toHaveCount(3);
  await expect(board.locator('.ps-spiel__zaun')).toBeVisible();
  await expect(board.locator('.ps-tabelle__ecke')).toHaveCount(1);
  await expect(board.locator('.ps-tabelle__kopf')).toHaveCount(4);
  await expect(board.locator('.ps-tabelle__feld')).toHaveCount(4);
  await expect(board.locator('.ps-tabelle__kopf img')).toHaveCount(4);
  // The raster: three columns of fields, every cell the one Spiel field.
  const raster = await board.locator('.ps-tabelle').evaluate((grid) => {
    const cells = [...grid.children] as HTMLElement[];
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      field: parseFloat(getComputedStyle(grid.closest('.ps-spiel')!).getPropertyValue('--talk-w')),
      lefts: [...new Set(cells.map((cell) => Math.round(cell.offsetLeft)))].length,
    };
  });
  expect(raster.columns).toBe(3);
  expect(raster.lefts).toBe(3);
  expect(raster.field).toBeCloseTo(30, 1);
  // The cut cards: one per card laid, none for the heads.
  await expect(sheet.locator('.ps-spiel-cut .ps-talk__card')).toHaveCount(3);

  // A column taken out goes with its head and every card under it.
  await showMaterial(page);
  // Its bin stands over the column, at the table's edge, and shows while the
  // pointer is in the column; pointed at, it outlines all it would take out.
  const spalteWeg = table.getByRole('button', { name: 'Spalte 2 löschen' });
  await kopf.nth(1).hover();
  await expect(spalteWeg.locator('..')).toHaveCSS('opacity', '1');
  const kopfBox = (await kopf.nth(1).boundingBox())!;
  expect((await spalteWeg.boundingBox())!.y + 20).toBeLessThan(kopfBox.y);
  await spalteWeg.hover();
  await expect(table.locator('.game-table--doomed')).toHaveCount(3);
  await spalteWeg.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(words(kopf)).toHaveText(['Tasse']);
  await expect(felder).toHaveCount(2);
  await expect.poll(async () => (await readSentences(page)).map((row) => row.slots[0]?.sourceToken ?? row.rawInput))
    .not.toContain('Pullover');

  // A row taken out goes with its head and its cards.
  const zeileWeg = table.getByRole('button', { name: 'Zeile 1 löschen' });
  expect((await zeileWeg.boundingBox())!.x + 20).toBeLessThan((await zeilenkopf.nth(0).boundingBox())!.x);
  await zeileWeg.hover();
  await expect(table.locator('.game-table--doomed')).toHaveCount(2);
  await zeileWeg.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(words(zeilenkopf)).toHaveText(['Rot']);
  await expect(words(felder)).toHaveText(['Rottasse']);
});

test('eine Tabelle wächst nur, solange das Blatt Platz hat', async ({ page }) => {
  /* The one field of every Spiel, 30 mm on A4: four columns of three rows
     stand beside their Ablage, a fifth column or a fourth row does not —
     Bearbeiten stops offering them. */
  const table = page.locator('.game-table');
  for (const term of ['Rot', 'Blau', 'Gelb']) await pick(page, page.locator('main'), '+ Zeile', term);
  for (const term of ['Eins', 'Zwei', 'Drei']) await pick(page, table, '+ Spalte', term);
  await expect(page.getByRole('button', { name: '+ Zeile' })).toBeVisible();
  await pick(page, table, '+ Spalte', 'Vier');
  await expect(table.locator('.game-table__kopf')).toHaveCount(4);
  await expect(table.getByRole('button', { name: '+ Spalte' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Zeile' })).toHaveCount(0);
});

test('die Kacheln: Spiel · Reihen und Spiel · Tabelle stehen einzeln nebeneinander, beide in der Spiel-Gruppe', async ({ page }) => {
  await expect(page.locator('.collection-head__other')).toContainText('Spiel · Tabelle');
  await page.getByRole('button', { name: 'Andere Vorlage wählen' }).click();
  const tiles = page.locator('.templates .tpl');
  await expect(tiles.filter({ hasText: /^Spiel · Reihen/ })).toHaveCount(1);
  await expect(tiles.filter({ hasText: /^Spiel · Tabelle/ })).toHaveCount(1);
  await tiles.filter({ hasText: /^Spiel · Reihen/ }).click();
  // Made a Spiel in Reihen instead, it is one: rows, no table.
  await expect(page.locator('.game__row')).toHaveCount(1);
  await expect(page.locator('.game-table')).toHaveCount(0);
  await expect(page.locator('.collection-head__other')).not.toContainText('Tabelle');
});
