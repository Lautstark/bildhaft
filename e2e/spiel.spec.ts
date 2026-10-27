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

  // A new Spiel prints without its words; asked for, they print under the pictures.
  await expect(page.locator('.print-view .ps-spiel__wort')).toHaveCount(0);
  await page.getByRole('button', { name: 'Symbol', exact: true }).click();
  await page.getByLabel('Beschriftung drucken').check();
  await page.keyboard.press('Escape');

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
  /* The symbol as drawn, not the variable it is drawn from: the two can part,
     and once did — the cut cards drew theirs at a share of the card instead. */
  const sizes = await page.evaluate(() => {
    const board = document.querySelector('.preview-frame .ps-spiel') as HTMLElement;
    const cut = document.querySelector('.preview-frame .ps-spiel-cut') as HTMLElement;
    const mm = (node: HTMLElement, name: string): number => parseFloat(getComputedStyle(node).getPropertyValue(name));
    const drawn = (img: HTMLImageElement) => Math.min(img.offsetWidth, img.offsetHeight) / (96 / 25.4);
    return {
      feld: mm(board, '--talk-w'), karte: mm(cut, '--talk-w'),
      symbolBlatt: drawn(board.querySelector('.ps-spiel__bild img')!),
      symbolBogen: drawn(cut.querySelector('.ps-talk__card img')!),
    };
  });
  expect(sizes.karte).toBeCloseTo(sizes.feld - 4, 1);
  expect(sizes.symbolBogen).toBeCloseTo(sizes.symbolBlatt, 0);

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
  await expect(page.getByText(/^Symbol \d+ mm$/)).toBeVisible();
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

test('ein Spiel wächst nur, solange das Blatt Platz hat — die Karten bleiben gleich groß', async ({ page }) => {
  /* Every Spiel prints the one field, 30 mm on A4, so a row offers its „+"
     only while another cell fits beside the Ablage, and the game its
     „+ Zeile" only while the sheet holds another row. */
  const rows = page.locator('.game__row');
  const first = rows.first();
  await pick(page, first, '+ Bild', 'Apfel');
  /* Without the word, as her games print: a word makes every card taller,
     and then four rows stand under each other instead of five. */
  await page.getByRole('button', { name: 'Symbol', exact: true }).click();
  await page.getByLabel('Beschriftung drucken').uncheck();
  await page.keyboard.press('Escape');
  for (const term of ['Birne', 'Apfel', 'Birne', 'Apfel']) await pick(page, first, '+ Bild', term);
  await expect(first.getByRole('button', { name: '+ Bild' })).toBeVisible();
  await pick(page, first, '+ Platzhalter', 'Birne');
  // Six cells and the Ablage's column fill A4 across: the row is full.
  await expect(first.locator('.game__cell')).toHaveCount(6);
  await expect(first.getByRole('button', { name: '+ Bild' })).toHaveCount(0);
  await expect(first.getByRole('button', { name: '+ Platzhalter' })).toHaveCount(0);

  await showSheet(page);
  const field = () => page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.preview-frame .ps-spiel') as HTMLElement).getPropertyValue('--talk-w')));
  await expect.poll(field).toBeCloseTo(30, 1);
  await showMaterial(page);

  // Rows: five fit under each other at six cells wide, and no sixth.
  const more = page.getByRole('button', { name: '+ Zeile' });
  for (let n = 2; n <= 5; n += 1) {
    await more.click();
    await expect(rows).toHaveCount(n);
  }
  await expect(more).toHaveCount(0);
  // The field has not shrunk to make room: the game stopped growing instead.
  await showSheet(page);
  await expect.poll(field).toBeCloseTo(30, 1);

  // Bearbeiten measured against the fullest sheet: punched at the left, with
  // page numbers too, the full game still prints at 30 mm.
  await page.getByRole('button', { name: 'Seite', exact: true }).click();
  await page.getByLabel('Zum Lochen').check();
  await page.getByRole('button', { name: 'links' }).click();
  await page.getByLabel('Seitenzahlen drucken').check();
  await expect.poll(field).toBeCloseTo(30, 1);
});

test('zum Lochen: der Rand an der Lochkante wird 2 cm, die Marken stehen darin', async ({ page }) => {
  const rows = page.locator('.game__row');
  await pick(page, rows.first(), '+ Bild', 'Apfel');
  await pick(page, rows.first(), '+ Platzhalter', 'Birne');

  await page.getByRole('button', { name: 'Seite', exact: true }).click();
  await page.getByLabel('Zum Lochen').check();
  // A Spiel is landscape: it starts punched at the top, where a binder wants it.
  await expect(page.getByRole('button', { name: 'oben' })).toHaveAttribute('aria-pressed', 'true');

  await showSheet(page);
  const sheetPage = page.locator('.preview-frame .ps-page').first();
  await expect(sheetPage.locator('.ps-punch')).toHaveCount(3);
  await expect(sheetPage.locator('.ps-punch--top')).toHaveCount(3);
  // The page box carries the margin itself, the paper none: so the marks can stand in it.
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('margin: 0');
  const pad = () => sheetPage.evaluate((node) => {
    const style = getComputedStyle(node);
    const mm = (px: string) => Math.round(parseFloat(px) / (96 / 25.4));
    return { top: mm(style.paddingTop), left: mm(style.paddingLeft) };
  });
  await expect.poll(pad).toEqual({ top: 20, left: 10 });

  await page.getByRole('button', { name: 'links' }).click();
  await expect(sheetPage.locator('.ps-punch--left')).toHaveCount(3);
  await expect.poll(pad).toEqual({ top: 10, left: 20 });

  // Marks off: the margin stays, the marks go.
  await page.getByLabel('Lochmarken').uncheck();
  await expect(sheetPage.locator('.ps-punch')).toHaveCount(0);
  await expect.poll(pad).toEqual({ top: 10, left: 20 });
});

test('Platzhalter für Anybook-Sticker: oben rechts auf jeder Karte mit Symbol, auf der Karte, mittig, der Kreis über höchstens der halben Ecke', async ({ page }) => {
  const rows = page.locator('.game__row');
  await pick(page, rows.first(), '+ Bild', 'Apfel');
  await pick(page, rows.first(), '+ Platzhalter', 'Birne');

  await page.getByRole('button', { name: 'Symbol', exact: true }).click();
  await page.getByLabel('Platzhalter für Anybook-Sticker').check();
  // A Spiel's cards have no room above their symbol: the circle only overlaps, nothing to choose.
  await expect(page.getByRole('button', { name: 'darüber' })).toHaveCount(0);
  await showSheet(page);

  /* The circle is the symbol box's ::after, at its top right; what is
     measured is the circle against the card and the picture against it. */
  const measure = (selector: string) => page.evaluate((sel) => {
    const mm = 96 / 25.4;
    return [...document.querySelectorAll(`.preview-frame ${sel}`)].map((card) => {
      // Überlappend: the circle is the card's own.
      const host = card;
      const circle = getComputedStyle(host, '::after');
      const box = card.getBoundingClientRect();
      const at = host.getBoundingClientRect();
      const img = card.querySelector('img')?.getBoundingClientRect();
      const scale = box.width / (card as HTMLElement).offsetWidth;
      const right = at.right - parseFloat(circle.right || '0') * scale;
      const left = right - scale * 9.5 * mm;
      return {
        circle: circle.content !== 'none' && circle.content !== 'normal',
        size: Math.round(parseFloat(circle.width) * 10 / mm) / 10,
        // The circle on the card, not over its edge.
        inside: right <= box.right + 0.05 * mm * scale && at.top >= box.top - 0.05 * mm * scale,
        // How far the picture's right edge stays left of the circle's left, in mm: half of it may lie over the corner.
        clear: img ? (left - img.right) / scale / mm : null,
        // The picture's middle against the card's, in mm: it stays in the middle.
        off: img ? ((img.left + img.right) / 2 - (box.left + box.right) / 2) / scale / mm : null,
      };
    });
  }, selector);

  for (const sel of ['.ps-spiel__bild', '.ps-spiel-cut .ps-talk__card']) {
    const cards = await measure(sel);
    expect(cards.length, sel).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.circle, sel).toBe(true);
      expect(card.size, sel).toBe(9.5);
      expect(card.inside, sel).toBe(true);
      expect(card.clear!, sel).toBeGreaterThanOrEqual(-5.3);
      expect(Math.abs(card.off!), sel).toBeLessThan(0.3);
    }
  }
  // A Platzhalter and the Ablage's dots carry no circle.
  for (const field of await measure('.ps-talk__field')) expect(field.circle).toBe(false);
  // The symbol gives up what the circle needs, the sheet's one measure for it, the one size on both sheets.
  const symbols = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.preview-frame .ps-spiel') as HTMLElement);
    const sym = parseFloat(style.getPropertyValue('--any-sym'));
    if (!(sym < parseFloat(style.getPropertyValue('--sym')))) return [Infinity];
    return [...document.querySelectorAll<HTMLImageElement>('.preview-frame :is(.ps-spiel__bild, .ps-talk__card) img')]
      .map((img) => Math.min(img.offsetWidth, img.offsetHeight) / (96 / 25.4) - sym);
  });
  expect(Math.max(...symbols)).toBeLessThanOrEqual(0.2);
  expect(Math.min(...symbols)).toBeGreaterThanOrEqual(-0.2);

  // A Spiel's cards are given: no room beside a symbol in the middle, so no „daneben“.
  await expect(page.getByRole('button', { name: 'daneben' })).toHaveCount(0);
});

test('auf A5 bietet das Spiel kein Anybook an: ausgegraut, mit dem Grund darunter, und der Bogen hat keinen Kreis', async ({ page }) => {
  await pick(page, page.locator('.game__row').first(), '+ Bild', 'Apfel');
  await page.getByRole('button', { name: 'Symbol', exact: true }).click();
  const box = page.getByLabel('Platzhalter für Anybook-Sticker');
  await box.check();
  await showSheet(page);
  await expect(page.locator('.preview-frame .ps-sheet--anybook').first()).toBeVisible();

  await page.getByRole('button', { name: 'Papier wählen' }).click();
  await page.locator('.paper-pick__pop').getByRole('button', { name: 'A5', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.preview-frame .ps-sheet--anybook')).toHaveCount(0);
  await page.getByRole('button', { name: 'Symbol', exact: true }).click();
  await expect(box).toBeDisabled();
  await expect(box).not.toBeChecked();
  await expect(page.getByText('Auf A5 sind die Karten zu klein für einen Anybook-Sticker. Auf A4 geht es.')).toBeVisible();
  if (process.env.OUT) await page.locator('.ding__pop').screenshot({ path: `${process.env.OUT}/menu-a5.png` });
});
