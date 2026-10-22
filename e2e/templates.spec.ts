import { expect, test, type Page } from '@playwright/test';
import { idForTerm, mockArasaac, readSentences } from './arasaac-mock.ts';
import { backToPrint, openLook, showMaterial, pickTemplate, showSheet, translate, untilKept } from './helpers.ts';
import { chooseFakeFolder, openSymbolSettings } from './metacom-folder.ts';

/**
 * The two templates share one host, and share it badly if either forgets to say
 * what it is drawing.
 *
 * This is here because of a defect that reached a screen: the card wall set the
 * grid on the shared node and the row list never set it back, so opening one
 * Wortkarten-Sammlung turned every row of every Sammlung opened afterwards into
 * a narrow column with its words stacked on top of each other. It survived the
 * whole unit suite, because nothing about it is wrong until something is drawn.
 */
/** The sidebar is open on arrival, so this is the wait for it and nothing more.
 *  It used to reveal the sidebar first: conventions.md §6.3 calls
 *  `defaultSettings()`'s stored `sidebarOpen: false` a bug against this product's
 *  own reader, which has always taken an absent preference to mean open. */
async function sidebarReady(page: Page): Promise<void> {
  await expect(page.locator('.sidebar')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('a Sammlung of rows still draws rows after a Sammlung of cards was open', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const wide = await page.locator('.row').first().boundingBox();

  // A second Sammlung, switched to the card template while it is still empty.
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  // The choice is the whole page: no name, no count above it yet.
  await expect(page.locator('.templates')).toBeVisible();
  await expect(page.locator('.collection-head')).toHaveCount(0);
  await pickTemplate(page, /^Wortkarten/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await page.keyboard.type('Karten');
  /* Nothing is asserted here on purpose: an empty Sammlung shows its empty
     state, so the host the card wall wrote its layout onto is not even in the
     page yet. Which is the shape of the defect — it is written on a node
     nobody is looking at and read on the next one that is. */

  // Back to the first one. Its rows are rows again.
  await sidebarReady(page);
  await page.locator('.sidebar__section--collections .collections__item')
    .filter({ hasNotText: 'Karten' }).first().click();
  await expect(page.locator('.row').first()).toBeVisible();

  const again = await page.locator('.row').first().boundingBox();
  expect(again?.width).toBeGreaterThan(400);
  expect(Math.round(again?.width ?? 0)).toBe(Math.round(wide?.width ?? 0));
});

/**
 * The Einkaufsliste is three sheets that only mean anything together, so what
 * is worth holding is that all three come out and that each is what it is:
 * a board that stays blank, cards that carry no word, and a place for every
 * card that carries both.
 *
 * The geometry is held too, because it is the part that silently goes wrong:
 * the cart is drawn *around* its zones, and a basket that does not contain them
 * is a printout somebody discovers with scissors in their hand.
 */
test('an Einkaufsliste prints its guide and three sheets, and the cart holds its zones', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Einkaufsliste/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();

  await page.getByLabel('Wörter hinzufügen').fill('Apfel');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  await expect(page.locator('.word__name')).toHaveText(['Apfel']);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');

  // The board first: if this is not there the template never took, and every
  // count below would fail for a reason that has nothing to do with printing.
  await expect(sheet.locator('.ps-board')).toHaveCount(1);
  // The guide, then three sheets: the board, the places, the cards.
  await expect(sheet.locator('.ps-page')).toHaveCount(4);

  // Fifteen to shop from and fifteen in the cart — measured, not chosen.
  await expect(sheet.locator('.ps-board > .ps-zones .ps-zone')).toHaveCount(15);
  await expect(sheet.locator('.ps-zones--cart .ps-zone')).toHaveCount(15);

  // A card carries no word; a place carries the word and the picture.
  await expect(sheet.locator('.ps-cut .ps-card__label')).toHaveCount(0);
  await expect(sheet.locator('.ps-place__word')).toHaveText(['Apfel']);
  // Cut lines go round the cards to cut and nowhere else: a place is not cut out.
  const dashed = (card: HTMLElement) => getComputedStyle(card).borderTopColor !== 'rgba(0, 0, 0, 0)';
  expect(await sheet.locator('.ps-cut .ps-card').first().evaluate(dashed)).toBe(true);
  expect(await sheet.locator('.ps-place .ps-card').first().evaluate(dashed)).toBe(false);

  /* The guide on a page of its own, nothing else on it, not even a foot.
     Then the board and the places, each under the name — they are what
     stays and hangs — and the cards to cut last. */
  const sheets = sheet.locator('.ps-page');
  await expect(sheets.nth(0).locator('.ps-guide h2')).toHaveText('So wird daraus eine Einkaufsliste');
  await expect(sheets.nth(0).locator('.ps-title, .ps-card, .ps-foot')).toHaveCount(0);
  await expect(sheets.nth(1).locator('.ps-board')).toHaveCount(1);
  await expect(sheets.nth(2).locator('.ps-place')).toHaveCount(1);
  await expect(sheets.nth(3).locator('.ps-cut')).toHaveCount(1);
  await expect(sheets.nth(1).locator('.ps-title')).toHaveCount(1);
  await expect(sheets.nth(2).locator('.ps-title')).toHaveCount(1);
  await expect(sheets.nth(3).locator('.ps-title')).toHaveCount(0);
  await page.getByLabel('Anleitung drucken').uncheck();
  await expect(sheet.locator('.ps-guide')).toHaveCount(0);
  await expect(sheets).toHaveCount(3);
  await page.getByLabel('Anleitung drucken').check();
  await expect(sheets).toHaveCount(4);
  /* A sheet's own break stays out of its page box: on paper it sent the
     page's foot, and the copyright line with it, onto the next sheet. */
  expect(await page.locator('#print-root .ps-page .ps-board').evaluate((board) => getComputedStyle(board).breakAfter)).toBe('auto');

  // The basket contains its zones, with air on every side.
  const basket = await sheet.locator('.ps-cart__art path').first().boundingBox();
  const first = await sheet.locator('.ps-zones--cart .ps-zone').first().boundingBox();
  const last = await sheet.locator('.ps-zones--cart .ps-zone').last().boundingBox();
  expect(first!.x).toBeGreaterThan(basket!.x);
  expect(first!.y).toBeGreaterThan(basket!.y);
  expect(last!.x + last!.width).toBeLessThan(basket!.x + basket!.width);
  expect(last!.y + last!.height).toBeLessThan(basket!.y + basket!.height);

  /* The paper is all it is asked, and the paper decides every millimetre:
     always landscape, and no frame, background or cut-line switch — the cut
     lines are always on the cards to cut. */
  const panel = page.locator('.print-view__panel');
  await expect(panel.getByRole('button', { name: 'Quer', exact: true })).toHaveCount(0);
  await expect(panel.getByText('Rahmen um jede Karte')).toHaveCount(0);
  await expect(panel.getByText('Hintergrundfarbe')).toHaveCount(0);
  await expect(panel.getByText('Schnittlinien anzeigen')).toHaveCount(0);
  /* Green until it is told otherwise: a light page behind the board, as a
     Tafel's colour, the cart and the name in a darker green. The board's
     page only: the places and the cards stay white. */
  const bg = (at: number) => sheets.nth(at).evaluate((one) => getComputedStyle(one).backgroundColor);
  const stroke = () => sheet.locator('.ps-cart__art').evaluate((art) => getComputedStyle(art).stroke);
  await expect(page.getByLabel('Seitenfarbe')).toBeChecked();
  expect(await bg(1)).toBe('rgb(217, 235, 211)');
  expect(await bg(2)).toBe('rgb(255, 255, 255)');
  expect(await stroke()).toBe('rgb(61, 125, 58)');
  await expect(sheets.nth(1).locator('.ps-title')).toHaveCSS('color', 'rgb(61, 125, 58)');
  expect(await sheets.nth(1).locator('.ps-zone').first()
    .evaluate((zone) => getComputedStyle(zone).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.getByLabel('Farbe des Wagens').fill('#2c66c8');
  await expect.poll(stroke).toBe('rgb(44, 102, 200)');
  await page.getByLabel('Seitenfarbe').uncheck();
  await expect.poll(() => bg(1)).toBe('rgb(255, 255, 255)');
  await page.getByLabel('Seitenfarbe').check();
  await expect.poll(() => bg(1)).toBe('rgb(217, 235, 211)');

  // Its name over the board is set as everywhere: size, colour, a line.
  await page.getByLabel('Linie darunter').check();
  await page.getByLabel('Schriftgröße des Titels').fill('20');
  await expect(sheet.locator('.ps-title').last()).toHaveCSS('border-bottom-style', 'solid');
  await panel.getByRole('button', { name: 'A3', exact: true }).click();
  await expect(sheet.locator('.ps-title').last()).toHaveCSS('border-bottom-style', 'solid');
  await panel.getByRole('button', { name: 'A4', exact: true }).click();
  const symbolMm = () => sheet.locator('.ps-cut .ps-card__img').first()
    .evaluate((img) => img.getBoundingClientRect().width / img.closest<HTMLElement>('.ps-sheet')!.getBoundingClientRect().width
      * img.closest<HTMLElement>('.ps-sheet')!.offsetWidth * 25.4 / 96);
  expect(await symbolMm()).toBeCloseTo(20, 0);
  // A card to cut is square, its cut line included: the dashed border used to sit outside the padding top and bottom only.
  const card = await sheet.locator('.ps-cut .ps-card').first().evaluate((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height }));
  expect(card.h).toBeCloseTo(card.w, 0);
  for (const [paper, mm] of [['A3', 28], ['A5', 14]] as const) {
    await panel.getByRole('button', { name: paper, exact: true }).click();
    await expect.poll(symbolMm).toBeCloseTo(mm, 0);
    // Still the guide and three sheets: nothing outgrows its page on any paper.
    await expect(sheets).toHaveCount(4);
    const fits = await sheets.nth(1).evaluate((sheetPage) =>
      [...sheetPage.querySelectorAll('.ps-zone')].every((zone) => {
        const outer = sheetPage.getBoundingClientRect(); const box = zone.getBoundingClientRect();
        return box.right <= outer.right && box.bottom <= outer.bottom;
      }));
    expect(fits).toBe(true);
  }
});

/**
 * A long Einkaufsliste: the places go on over as many sheets as they need,
 * each under the name, and the cards to cut fill their sheet edge to edge
 * rather than stopping at a fixed count.
 */
test('a long Einkaufsliste names every sheet of places, and packs its cards', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Einkaufsliste/);
  for (let n = 1; n <= 40; n++) {
    await page.getByLabel('Wörter hinzufügen').fill(`Ding${n}`);
    await page.getByLabel('Wörter hinzufügen').press('Enter');
    await expect(page.locator('.word__name')).toHaveCount(n);
  }
  await showSheet(page);
  const sheets = page.locator('.preview-frame .ps-page');
  await page.locator('.print-view__panel').getByRole('button', { name: 'A5', exact: true }).click();
  // On A5 the places take two sheets, and both carry the name.
  const placed = sheets.filter({ has: page.locator('.ps-place') });
  await expect(placed).toHaveCount(2);
  for (const at of [0, 1]) await expect(placed.nth(at).locator('.ps-title')).toHaveCount(1);
  await expect(page.locator('.preview-frame .ps-place')).toHaveCount(40);
  // All forty cards to cut go on one A5 sheet: more than the thirty-five it used to stop at.
  const cut = sheets.filter({ has: page.locator('.ps-cut') });
  await expect(cut).toHaveCount(1);
  await expect(cut.locator('.ps-card')).toHaveCount(40);
});

/**
 * A Tafel is a grid whose fields are filled by hand, and some not at all.
 *
 * Held here: a word typed into the bar lands beside the Tafel and not on it;
 * dragged into a field it lies there and nowhere else; a field left free is
 * printed free, the same size as the others; and a grid made smaller keeps the
 * cards that still have a place. Those are the four ways a Tafel differs from
 * a sheet of cards, and each is a card silently gone when it fails.
 */
test('a Tafel takes its cards by dragging, and prints its free fields', async ({ page }) => {
  // Tall enough for the tray under a Tafel of square tiles to be on screen:
  // a drag that starts off screen is not a drag.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  // And the sidebar says so under the name, where eleven look-alike rows are told apart.
  await expect(page.locator('.sidebar .collections [aria-current]')).toContainText('Tafel');

  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Apfel\nBanane');
  await bar.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveText(['Apfel', 'Banane']);

  // Sized 4 × 3 until somebody says otherwise, and every field free.
  const cells = page.locator('.board .cell');
  await expect(cells).toHaveCount(12);
  await expect(page.locator('.board .cell--free')).toHaveCount(12);

  // The drag itself, from the tray into the sixth field.
  await page.locator('.tray .board-card').filter({ hasText: 'Apfel' }).dragTo(cells.nth(5));
  await expect(cells.nth(5).locator('.word__name')).toHaveText('Apfel');
  await expect(page.locator('.tray .word__name')).toHaveText(['Banane']);

  // And on into another field: it moves, it is not copied.
  await cells.nth(5).locator('.board-card').dragTo(cells.nth(1));
  await expect(cells.nth(1).locator('.word__name')).toHaveText('Apfel');
  await expect(cells.nth(5)).toHaveClass(/cell--free/);

  // Without a mouse: the arrow puts a card into the first free field.
  await page.getByRole('button', { name: '„Banane“ ins erste freie Feld legen' }).click();
  await expect(cells.nth(0).locator('.word__name')).toHaveText('Banane');
  await expect(page.locator('.tray .word__name')).toHaveCount(0);

  // A smaller grid keeps what still has a place. Both cards are in the first
  // row, so 3 × 2 keeps them and the twelve fields become six. The grid is the
  // Tafel's, set over it: typed, or a step at a time.
  await page.getByLabel('Spalten').fill('3');
  await page.getByRole('button', { name: 'Eine Zeile weniger' }).click();
  await expect(cells).toHaveCount(6);
  await expect(page.locator('.board .word__name')).toHaveText(['Banane', 'Apfel']);
  // A field has its paper's shape: three across and two down on A4 upright
  // is a field taller than wide, here as on the sheet.
  await expect(page.locator('.board-head')).toContainText('Feld 63,3 × 135,8 mm');
  const shape = (await cells.first().boundingBox())!;
  expect(shape.height / shape.width).toBeCloseTo(135.8 / 63.3, 1);
  // Marking a field does not move the Tafel: the panel is held at the foot of the window.
  const before = (await page.locator('.board').boundingBox())!.y;
  await cells.nth(4).click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole('group', { name: 'Markierte Felder' })).toBeVisible();
  expect((await page.locator('.board').boundingBox())!.y).toBe(before);
  await page.getByRole('button', { name: 'Fertig' }).click();
  // Smaller again, and the card whose field went comes back to the tray, and that is said.
  await page.getByLabel('Spalten').fill('1');
  await expect(cells).toHaveCount(2);
  await expect(page.locator('.tray .word__name')).toHaveText(['Apfel']);
  await expect(page.getByText('1 Karte liegt wieder unter „Noch nicht auf der Tafel“.')).toBeVisible();
  await page.getByRole('button', { name: 'Eine Spalte mehr' }).click();
  await page.getByRole('button', { name: 'Eine Spalte mehr' }).click();
  await expect(cells).toHaveCount(6);
  await page.getByRole('button', { name: '„Apfel“ ins erste freie Feld legen' }).click();
  await expect(page.locator('.board .word__name')).toHaveText(['Banane', 'Apfel']);

  // The paper: six fields, two with a card, four free and drawn anyway.
  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-tafel')).toHaveCount(1);
  await expect(sheet.locator('.ps-tafel .ps-card')).toHaveCount(6);
  await expect(sheet.locator('.ps-tafel .ps-card--empty')).toHaveCount(4);
  await expect(sheet.locator('.ps-tafel .ps-card__label')).toHaveText(['Banane', 'Apfel']);
  // A free field is exactly the size of a full one, or the grid is not a grid.
  /* Read in one go, as laid out: a box asked for one card at a time came
     back null when the preview was built again between the two. */
  const [full, free] = await sheet.locator('.ps-tafel').first().evaluate((tafel) =>
    [tafel.querySelector<HTMLElement>('.ps-card')!, tafel.querySelector<HTMLElement>('.ps-card--empty')!]
      .map((card) => ({ width: card.offsetWidth, height: card.offsetHeight })));
  expect(free!.width).toBe(full!.width);
  expect(free!.height).toBe(full!.height);
  // The grid is the Tafel's, so the sheet only says how big a field comes out — nothing on it is cut.
  await expect(page.getByLabel('Spalten')).toHaveCount(0);
  await expect(page.getByText('Feld: 63 × 136 mm.')).toBeVisible();
  await expect(page.getByText('Karte zum Ausschneiden:')).toHaveCount(0);
  /* And nothing on it is cut. The switch is not offered here — a Tafel is
     laminated whole — but the setting is one remembered list shared by every
     template, so an answer given on a card sheet used to reach this paper
     anyway and draw a dashed line through every field. */
  await expect(page.getByLabel('Schnittlinien')).toHaveCount(0);
  await expect(sheet.locator('.ps-sheet--cutlines')).toHaveCount(0);
  /* A free field prints as nothing until asked; asked, each free field —
     and only those — gets its dashed place, inside the air as a frame is. */
  await expect(sheet.locator('.ps-card__place')).toHaveCount(0);
  await page.getByLabel('Leere Felder gestrichelt drucken').check();
  await expect(sheet.locator('.ps-tafel .ps-card--empty .ps-card__place')).toHaveCount(4);
  await expect(sheet.locator('.ps-card__place')).toHaveCount(4);
  // And it is this Tafel's: it is still there when the Tafel is opened again.
  await untilKept(page, 'markFreeFields', true);
  await page.reload();
  await showSheet(page);
  await expect(page.getByLabel('Leere Felder gestrichelt drucken')).toBeChecked();
  await expect(page.locator('.preview-frame .ps-card__place')).toHaveCount(4);
  // The frame's thickness, corners and colour stand right under its check, not under this one.
  await page.getByLabel('Rahmen um jede Karte').check();
  const colour = await page.locator('#opt-border-color').boundingBox();
  const dashed = await page.getByLabel('Leere Felder gestrichelt drucken').boundingBox();
  expect(colour!.y).toBeLessThan(dashed!.y);
});

/**
 * The drag that stopped working after the first one.
 *
 * Not a bug in the drag: the first card dropped made every row of the grid
 * as tall as a card, so a field with a card in it is now barely taller than
 * one without. Held with a Tafel as full as a real one, every card dragged
 * in turn, because the failure only showed from the second drag on.
 */
test.describe('a full Tafel', () => {
  // The tray sits under the grid and the page scrolls; a drag across the
  // fold is the browser's own edge-scrolling, which a test cannot hold. So
  // the window is tall enough for the whole Tafel, and what is held is the
  // drags themselves.
  test.use({ viewport: { width: 1280, height: 1500 } });

test('every card of a full Tafel can be dragged from the tray, one after the other', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();

  const names = Array.from({ length: 24 }, (_, i) => `Wort${i + 1}`);
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill(names.join('\n'));
  await bar.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveCount(24);
  await page.getByLabel('Spalten').fill('6');
  await page.getByLabel('Zeilen').fill('4');
  const cells = page.locator('.board .cell');
  await expect(cells).toHaveCount(24);

  for (const [i, name] of names.entries()) {
    const card = page.locator('.tray .board-card')
      .filter({ has: page.locator('.word__name', { hasText: new RegExp(`^${name}$`) }) });
    await card.locator('.word__pic').dragTo(cells.nth(i));
    await expect(cells.nth(i).locator('.word__name')).toHaveText(name);
  }
  // Every card stays inside its field, with the field's air around it: a
  // narrow field used to let the card push out over its neighbours.
  for (let i = 0; i < names.length; i += 1) {
    const cell = (await cells.nth(i).boundingBox())!;
    const card = (await cells.nth(i).locator('.word').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(cell.x + 7);
    expect(card.x + card.width).toBeLessThanOrEqual(cell.x + cell.width - 7);
    expect(card.y + card.height).toBeLessThanOrEqual(cell.y + cell.height - 7);
  }
  await expect(page.locator('.tray .word__name')).toHaveCount(0);

  // Back out by dragging onto the tray, and a swap between two full fields.
  await cells.nth(0).locator('.board-card').dragTo(page.locator('.tray'));
  await expect(page.locator('.tray .word__name')).toHaveText(['Wort1']);
  await cells.nth(2).locator('.board-card').dragTo(cells.nth(4));
  await expect(cells.nth(2).locator('.word__name')).toHaveText('Wort5');
  await expect(cells.nth(4).locator('.word__name')).toHaveText('Wort3');
});
});

/**
 * A „+" pressed and thought better of leaves nothing behind.
 *
 * It used to leave a blank card: the picker closed without a choice took the
 * card's only slot away and kept the record, so a card with no picture, no
 * word and nothing to open sat in the tray or the field, and its × asked
 * „Zeile löschen — „“ wird entfernt" of anybody who tried to get rid of it.
 * On a Tafel every free field is a large „+", so this was pressed a lot.
 */
test('a Tafel field or tray „+" closed without a choice leaves no card', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Apfel');
  await bar.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveText(['Apfel']);

  // In a field: the picker opens on a card lying there, and closing it takes
  // the card away again and leaves the field free.
  await page.getByRole('button', { name: 'Neue Karte in Feld 3' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.board .cell').nth(2)).toHaveClass(/cell--free/);
  await expect(page.locator('.word:not(.word--add)')).toHaveCount(1);

  // In the tray: the same.
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.word:not(.word--add)')).toHaveCount(1);
  await expect(page.locator('.tray .word__name')).toHaveText(['Apfel']);
});

/**
 * A colour behind a group of fields, the way a Symboltafel sets its
 * feelings or its colours apart: one rounded block, cards white on it.
 *
 * The colour is dragged onto the fields like a card, and a drag across
 * several fields colours them all. A drag rather than a mode, because a mode
 * had to be left before a field could be filled or a card moved — and it was
 * not, so with a colour chosen nothing else worked. Held on screen and on
 * paper, because the two draw the block from one answer.
 */
test.describe('colour on a Tafel', () => {
  // Tall, for the same reason the full Tafel above is: the tray is under the
  // grid, and one drag here goes from one to the other.
  test.use({ viewport: { width: 1280, height: 1500 } });

/**
 * A colour behind a group of fields, made the way cells in a table are
 * coloured: mark the fields, press a colour. A press on a field's air marks
 * it, a press held and moved frames several, a press on a coloured field
 * marks its whole block. Nothing is a mode and nothing sits on a card: the
 * „+" of a field and the dragging of cards work throughout. Held on screen
 * and on paper, because the two draw the block from one answer.
 */
test('fields are marked and grouped, on screen and on paper', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Rot');
  await bar.press('Enter');
  await page.getByRole('button', { name: '„Rot“ ins erste freie Feld legen' }).click();

  const cells = page.locator('.board .cell');
  const zoned = page.locator('.cell--zoned');
  const marked = page.locator('.cell--selected');
  const panel = page.getByRole('group', { name: 'Markierte Felder' });
  /** The tile of a field: its top-left corner, off the card and off the „+". */
  const tile = async (i: number) => { const b = (await cells.nth(i).boundingBox())!; return { x: b.x + 5, y: b.y + 5 }; };
  const pressTile = async (i: number) => { const p = await tile(i); await page.mouse.click(p.x, p.y); };

  // Two presses on the tiles mark two fields; the panel says so.
  await pressTile(0);
  await pressTile(1);
  await expect(marked).toHaveCount(2);
  await expect(panel).toContainText('2 Felder');
  // The press on the tile did not open the card's picker.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A background: the fields are a group on the spot, the marks stay for the next choice.
  await page.getByRole('button', { name: 'Hintergrund Gelb' }).click();
  await expect(zoned).toHaveCount(2);
  await expect(marked).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Hintergrund Gelb' })).toHaveAttribute('aria-pressed', 'true');
  // One block: the shared corners square, the outer ones round, stepped in only where it ends.
  const zone = (i: number) => cells.nth(i).locator('.cell__zone');
  await expect(zone(0)).toHaveCSS('border-top-left-radius', '12px');
  await expect(zone(0)).toHaveCSS('border-top-right-radius', '0px');
  await expect(zone(0)).toHaveCSS('left', '4px');
  await expect(zone(0)).toHaveCSS('right', '-2px');
  await expect(zone(0)).toHaveCSS('background-color', 'rgb(255, 241, 179)');
  // A frame, along the block's own sides only; and a name, as a shield on the first field.
  await page.getByRole('button', { name: 'Rahmen Gelb' }).click();
  await expect(zone(0)).toHaveCSS('border-left-width', '2px');
  await expect(zone(0)).toHaveCSS('border-right-width', '0px');
  await expect(zone(1)).toHaveCSS('border-right-width', '2px');
  await page.getByLabel('Name', { exact: true }).fill('Farben');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(cells.nth(0).locator('.cell__shield')).toHaveText('Farben');
  await expect(cells.nth(1).locator('.cell__shield')).toHaveCount(0);
  // „Kein" takes the frame off again and leaves the rest.
  await page.getByRole('button', { name: 'Rahmen: Kein' }).click();
  await expect(zone(0)).toHaveCSS('border-left-width', '0px');
  await expect(cells.nth(0).locator('.cell__shield')).toHaveText('Farben');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(marked).toHaveCount(0);
  await expect(panel).toHaveCount(0);

  // A frame drawn across three fields marks all three; a frame alone is a group too.
  const from = await tile(4);
  const to = (await cells.nth(6).boundingBox())!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width - 5, to.y + to.height - 5, { steps: 10 });
  await page.mouse.up();
  await expect(marked).toHaveCount(3);
  await page.getByRole('button', { name: 'Rahmen Grün' }).click();
  await expect(zoned).toHaveCount(5);
  await expect(zone(5)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  // One more field under the first makes it an L. At the inner corner the
  // field the block turns at is cut back and carries the frame round.
  await pressTile(8);
  await expect(marked).toHaveCount(4);
  await page.getByRole('button', { name: 'Hintergrund Grün' }).click();
  await expect(zoned).toHaveCount(6);
  await expect(zone(4)).toHaveCSS('clip-path', /polygon/);
  await expect(cells.nth(4).locator('.cell__joint')).toHaveCount(1);
  await expect(cells.nth(5).locator('.cell__joint')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(marked).toHaveCount(0);

  // A press on a grouped field marks its whole block and shows its group. A
  // press on one of its fields then marks that one alone, and „Aus Gruppe
  // nehmen" takes it out while the rest stays a group.
  await pressTile(5);
  await expect(marked).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Rahmen Grün' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Aus Gruppe nehmen' })).toHaveCount(0);
  await pressTile(8);
  await expect(marked).toHaveCount(1);
  await page.getByRole('button', { name: 'Aus Gruppe nehmen' }).click();
  await expect(zoned).toHaveCount(5);
  await expect(marked).toHaveCount(0);
  // „Gruppe entfernen" takes the rest away.
  await pressTile(5);
  await expect(marked).toHaveCount(3);
  await page.getByRole('button', { name: 'Gruppe entfernen' }).click();
  await expect(zoned).toHaveCount(2);
  await expect(marked).toHaveCount(0);

  // A colour of one's own, and Escape puts a selection down.
  await pressTile(8);
  await page.getByLabel('Eigene Farbe: Hintergrund').fill('#c8e6ff');
  await expect(zone(8)).toHaveCSS('background-color', 'rgb(200, 230, 255)');
  await page.keyboard.press('Escape');
  await pressTile(9);
  await expect(marked).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(marked).toHaveCount(0);

  // From the keyboard: Space marks a field, Shift with an arrow marks the neighbour too.
  await cells.nth(10).focus();
  await page.keyboard.press(' ');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(marked).toHaveCount(2);
  await page.getByRole('button', { name: 'Hintergrund Rosa' }).click();
  await expect(zoned).toHaveCount(5);
  await page.keyboard.press('Escape');

  // Nothing was put into a mode: a free field's „+" still opens the picker,
  // and a card is still dragged into a grouped field.
  await page.getByRole('button', { name: 'Neue Karte in Feld 2' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Wörter hinzufügen').fill('Blau');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  const card = page.locator('.tray .board-card').filter({ hasText: 'Blau' }).locator('.word__pic');
  const c = (await card.boundingBox())!;
  const d = (await cells.nth(1).boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(cells.nth(1).locator('.word__name')).toHaveText('Blau');

  await showSheet(page);
  const printed = page.locator('.preview-frame .ps-tafel .ps-card');
  await expect(page.locator('.preview-frame .ps-block')).toHaveCount(5);
  await expect(printed.nth(0).locator('.ps-block')).toHaveCSS('background-color', 'rgb(255, 241, 179)');
  await expect(printed.nth(8).locator('.ps-block')).toHaveCSS('background-color', 'rgb(200, 230, 255)');
  // The name goes to paper with it, once, on the block's first field.
  await expect(page.locator('.preview-frame .ps-shield')).toHaveText(['Farben']);
  // The block steps in where it ends and not where it goes on, as on screen.
  const box = await printed.nth(0).locator('.ps-block').boundingBox();
  const cell = await printed.nth(0).boundingBox();
  expect(box!.x).toBeGreaterThan(cell!.x);
  expect(box!.x + box!.width).toBeGreaterThan(cell!.x + cell!.width);
  // The card stays white on its colour.
  await expect(printed.nth(0).locator('.ps-card__frame')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  // The air around a card is named as air, comes from the field, and is the Tafel's own once set.
  const airInput = page.getByLabel('Rand', { exact: true });
  await expect(airInput).toHaveValue('5');
  await airInput.fill('3');
  await expect(printed.nth(0).locator('.ps-block')).toHaveCount(1);
  // Kept by the Tafel: there after the page is loaded again.
  await page.reload();
  await showSheet(page);
  await expect(page.getByLabel('Rand', { exact: true })).toHaveValue('3');
});
});

/**
 * A Rezept is three parts with a box each, and the paper keeps them apart.
 *
 * Held here: a line lands in the part whose box it was typed into and nowhere
 * else; a Zutat's amount stays on the card and off the lookup, so „2 Eier"
 * gets the picture for „Eier"; the Schritte read top to bottom in the order
 * they were typed, numbered, which is the reverse of a Satzstreifen; and the
 * paper carries the three headings, the numbers and the name — and, with
 * pictures too big for one page, goes on to a second rather than shrinking.
 */
test('a Rezept takes each part in its own box, and prints them in order', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Rezept/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await page.keyboard.type('Waffeln (5–6 Stück)');
  // Its parts have their own boxes, so the composer above would be a fourth.
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);

  const zutaten = page.getByRole('region', { name: 'Zutaten' });
  await page.getByLabel('Zutat hinzufügen').fill('2 Eier\n325 ml Milch');
  await page.getByLabel('Zutat hinzufügen').press('Enter');
  await expect(zutaten.locator('.word__name')).toHaveText(['2 Eier', '325 ml Milch']);

  const eier = await readSentences(page).then((rows) => rows.find((r) => r.rawInput === '2 Eier'));
  expect(eier?.slots[0]?.sourceToken).toBe('Eier');
  expect(eier?.slots[0]?.chosen).toBe(String(idForTerm('Eier')));

  // One box at the top; the switch in front of it says which part a line goes into.
  await page.locator('.recipe__parts').getByRole('button', { name: 'Hilfsmittel', exact: true }).click();
  await page.getByLabel('Hilfsmittel hinzufügen').fill('Schüssel');
  await page.getByLabel('Hilfsmittel hinzufügen').press('Enter');
  await expect(page.getByRole('region', { name: 'Hilfsmittel' }).locator('.word__name'))
    .toHaveText(['Schüssel']);
  await expect(zutaten.locator('.word__name')).toHaveCount(2);

  // Two submissions, so the order is the one they were typed in and not a batch's.
  const schritte = page.getByRole('region', { name: 'Schritte' });
  await page.locator('.recipe__parts').getByRole('button', { name: 'Schritte', exact: true }).click();
  for (const [at, step] of ['Eier in die Schüssel', 'Rühren'].entries()) {
    await page.getByLabel('Schritt hinzufügen').fill(step);
    await page.getByLabel('Schritt hinzufügen').press('Enter');
    await expect(schritte.locator('.row')).toHaveCount(at + 1);
  }
  await expect(schritte.locator('.row__step')).toHaveText(['1', '2']);
  expect(await schritte.locator('.row__title').evaluateAll((fields) =>
    fields.map((field) => field.getAttribute('placeholder')))).toEqual(['Eier in die Schüssel', 'Rühren']);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title')).toHaveText('Waffeln (5–6 Stück)');
  await expect(sheet.locator('.ps-recipe-head')).toHaveText(['Zutaten', 'Hilfsmittel', 'Schritte']);
  await expect(sheet.locator('.ps-recipe-cards').first().locator('.ps-card__label'))
    .toHaveText(['2 Eier', '325 ml Milch']);
  await expect(sheet.locator('.ps-recipe-step__n')).toHaveText(['1', '2']);
  await expect(sheet.locator('.ps-page')).toHaveCount(1);

  // Bigger pictures: the Schritte go on over the page at the size asked for.
  await page.getByLabel('Symbolgröße').fill('60');
  await expect(sheet.locator('.ps-page')).toHaveCount(2);
  await expect(sheet.locator('.ps-page').nth(1).locator('.ps-recipe-step')).not.toHaveCount(0);
  const img = await sheet.locator('.ps-recipe-step .ps-card__img').last().evaluate((node) =>
    parseFloat(getComputedStyle(node).width));
  expect(img).toBeCloseTo(60 * 96 / 25.4, 0);

  // The name goes along with the Rezept's colour until it is given its own,
  // and it can be left off, as on every other template.
  const title = sheet.locator('.ps-title');
  await expect(title).toHaveCSS('border-bottom-style', 'solid');
  await page.getByLabel('Farbe', { exact: true }).fill('#118833');
  await expect(title).toHaveCSS('color', 'rgb(17, 136, 51)');
  await page.getByLabel('Farbe des Titels').fill('#aa0000');
  await page.getByLabel('Farbe', { exact: true }).fill('#118834');
  await expect(title).toHaveCSS('color', 'rgb(170, 0, 0)');
  await page.getByLabel('Titel drucken').uncheck();
  await expect(title).toHaveCount(0);
});

/**
 * A Rezept is changed where it stands, the way a Lied is.
 *
 * Held here: an empty part says so, and no second „noch leer" box stands over
 * the parts; the part the box writes into is the one outlined; each part takes
 * lines of its own under it; „✎ Text" writes a part again in the order of the
 * text, keeping the row of a line it keeps and taking out the one it drops;
 * and the paper is the Rezept's to choose, as a Lied's is.
 */
test('a Rezept is changed part by part, and chooses its paper', async ({ page }) => {
  await pickTemplate(page, /^Rezept/);
  await expect(page.getByText('Noch keine Zutaten.')).toBeVisible();
  await expect(page.getByText('Noch keine Schritte.')).toBeVisible();
  await expect(page.locator('.empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Andere Vorlage wählen' })).toBeVisible();

  const zutaten = page.getByRole('region', { name: 'Zutaten' });
  const schritte = page.getByRole('region', { name: 'Schritte' });
  await expect(zutaten).toHaveClass(/recipe__part--target/);
  await page.locator('.recipe__parts').getByRole('button', { name: 'Schritte', exact: true }).click();
  await expect(schritte).toHaveClass(/recipe__part--target/);
  await expect(zutaten).not.toHaveClass(/recipe__part--target/);

  // Under the part itself: the field stays for the next line.
  await schritte.getByRole('button', { name: '+ Schritt' }).click();
  for (const step of ['Eier in die Schüssel', 'Rühren', 'Backen']) {
    await page.getByLabel('Neuer Schritt').fill(step);
    await page.getByLabel('Neuer Schritt').press('Enter');
  }
  await expect(schritte.locator('.row')).toHaveCount(3);
  const rows = await readSentences(page);
  const eier = rows.find((row) => row.rawInput === 'Eier in die Schüssel')!.id;

  // As text: one dropped, one new, the rest reordered — and the kept keep their rows.
  await page.getByRole('button', { name: 'Schritte als Text bearbeiten' }).click();
  const text = page.getByRole('textbox', { name: 'Schritte als Text bearbeiten' });
  await expect(text).toHaveValue('Eier in die Schüssel\nRühren\nBacken');
  await text.fill('Mehl dazu\nEier in die Schüssel\nBacken');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(schritte.locator('.row__title')).toHaveCount(3);
  await expect.poll(async () => (await schritte.locator('.row__title').evaluateAll((fields) =>
    fields.map((field) => field.getAttribute('placeholder'))))).toEqual(['Mehl dazu', 'Eier in die Schüssel', 'Backen']);
  const after = await readSentences(page);
  expect(after.find((row) => row.rawInput === 'Eier in die Schüssel')!.id).toBe(eier);
  expect(after.map((row) => row.rawInput)).not.toContain('Rühren');

  // The paper: A5 across, kept by the Rezept. Nothing on it is cut apart, so
  // the size names no card to cut out.
  await showSheet(page);
  await expect(page.getByLabel('Symbolgröße')).toBeVisible();
  await expect(page.getByText('Karte zum Ausschneiden')).toHaveCount(0);
  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await page.locator('.print-view__panel').getByRole('button', { name: 'Quer', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('size: 210mm 148mm');
  await untilKept(page, 'orientation', 'landscape');
  await page.reload();
  await showSheet(page);
  await expect(page.locator('.print-view__panel').getByRole('button', { name: 'Quer', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
});

/**
 * A Rezept's name can have a picture, set beside it in Bearbeiten and printed
 * with it: the sheet shows the name as it stands there, and „Titel auf der
 * ersten Seite" prints both or neither. Each part is printed under a band in
 * the Rezept's colour. The picture is not one of the entries.
 */
test('a Rezept prints its name with the picture it was given, and its parts under bands', async ({ page }) => {
  await pickTemplate(page, /^Rezept/);
  await page.getByLabel('Zutat hinzufügen').fill('2 Eier');
  await page.getByLabel('Zutat hinzufügen').press('Enter');
  await expect(page.getByRole('region', { name: 'Zutaten' }).locator('.word')).toHaveCount(1);

  await page.getByRole('button', { name: 'Bild zum Titel wählen' }).click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.locator('.picker__item', { hasText: 'Banane' }).first().click();
  await expect(page.getByRole('button', { name: 'Bild zum Titel ändern' }).locator('img')).toBeVisible();
  await expect(page.locator('.collection-head')).toContainText('1 Eintrag');

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title .ps-title__pic img')).toBeVisible();
  await expect(sheet.locator('.ps-recipe-head')).toHaveText(['Zutaten']);
  expect(await sheet.locator('.ps-recipe-head').first().evaluate((el) => getComputedStyle(el).color))
    .toBe('rgb(255, 255, 255)');

  await page.getByLabel('Titel drucken').uncheck();
  await expect(sheet.locator('.ps-title')).toHaveCount(0);
  await expect(sheet.locator('.ps-title__pic')).toHaveCount(0);

  // Taken out again in the picker, the name prints alone.
  await page.getByLabel('Titel drucken').check();
  await showMaterial(page);
  await page.getByRole('button', { name: 'Bild zum Titel ändern' }).click();
  await page.getByRole('button', { name: 'Feld entfernen' }).click();
  await expect(page.getByRole('button', { name: 'Bild zum Titel wählen' })).toBeVisible();
  await showSheet(page);
  await expect(sheet.locator('.ps-title')).toBeVisible();
  await expect(sheet.locator('.ps-title__pic')).toHaveCount(0);
});

/**
 * A Tafel can have a picture beside its name and a colour behind its page —
 * what tells a household's boards apart. The picture is chosen as a Rezept's
 * is, prints with the name, and is no card: it waits in no tray. A field gives
 * up the picture's height, so the grid still fits its page. The colour is the
 * Tafel's alone, on the page it prints, and gone again when switched off.
 */
test('a Tafel prints its name with a picture, on a colour of its own', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Tafel/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Apfel');
  await bar.press('Enter');
  await page.getByRole('button', { name: '„Apfel“ ins erste freie Feld legen' }).click();
  await expect(page.locator('.tray .word__name')).toHaveCount(0);
  // A Tafel prints no name until asked; the picture comes and goes with it.
  // One sheet, so it is asked whether, not where.
  await showSheet(page);
  await page.getByLabel('Titel drucken').check();
  await expect(page.getByRole('button', { name: 'Jede Seite', exact: true })).toHaveCount(0);
  await showMaterial(page);
  const size = page.locator('.board-head__size');
  const plain = await size.innerText();

  await page.getByRole('button', { name: 'Bild zum Titel wählen' }).click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.locator('.picker__item', { hasText: 'Banane' }).first().click();
  await expect(page.getByRole('button', { name: 'Bild zum Titel ändern' }).locator('img')).toBeVisible();
  // No card: neither in the tray nor in the count.
  await expect(page.locator('.tray .word__name')).toHaveCount(0);
  await expect(page.locator('.collection-head')).toContainText('1 Karte');
  // The fields are as wide as before and shorter by the picture.
  const mmOf = (text: string) => text.match(/([\d,]+) × ([\d,]+)/)!.slice(1).map((n) => Number(n.replace(',', '.')));
  await expect(size).not.toHaveText(plain);
  const [w0, h0] = mmOf(plain);
  const [w1, h1] = mmOf(await size.innerText());
  expect(w1).toBe(w0);
  expect(h1).toBeLessThan(h0);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title .ps-title__pic img')).toBeVisible();
  const background = () => sheet.locator('.ps-page').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background()).toBe('rgb(255, 255, 255)');

  await page.getByLabel('Seitenfarbe').check();
  await expect.poll(background).toBe('rgb(169, 203, 236)');
  // The printer's copy too, not only the preview.
  expect(await page.locator('#print-root .ps-sheet').evaluate((el) => el.style.getPropertyValue('--page-bg')))
    .toBe('#a9cbec');

  // And to the paper's edge: its page has no margin of its own, it carries it on the colour.
  const pageRule = () => page.locator('#print-page-setup').textContent();
  await expect.poll(pageRule).toContain('margin: 0;');
  expect(await page.locator('#print-root .ps-page').first().evaluate((el) => el.classList.contains('ps-page--coloured')))
    .toBe(true);

  await page.getByLabel('Seitenfarbe').uncheck();
  await expect.poll(background).toBe('rgb(255, 255, 255)');
  await expect.poll(pageRule).not.toContain('margin: 0;');
});

/**
 * A group's colour is one surface on paper, not one patch per field. The
 * preview draws the page scaled down, and each field's layer has to reach far
 * enough into its neighbour's that the two still overlap there — at a third of
 * a millimetre they met in less than a pixel, and a pale line ran between every
 * two fields of a coloured block.
 */
test('a group colour reaches over from field to field in the scaled preview', async ({ page }) => {
  const now = Date.now();
  const card = (id: string, word: string) => ({
    id, normalizedInput: word, rawInput: word, createdAt: now, updatedAt: now,
    slots: [{ id: `${id}-slot`, sourceToken: word, concept: word, origin: 'manual', choice: {}, candidates: {} }],
  });
  const tafel = {
    format: 'bildhaft.collection', version: 3, exportedAt: new Date(now).toISOString(), notice: '',
    sentences: [card('a', 'Brot'), card('b', 'Käse')],
    collection: {
      id: 'c', name: 'Flächen', createdAt: now, updatedAt: now, kind: 'tafel',
      board: { cols: 2, rows: 1, cells: ['a', 'b'], zones: ['g1', 'g1'], styles: { g1: { fill: '#79aee3' } } },
    },
  };
  await page.getByRole('complementary').getByRole('button', { name: 'Einstellungen' }).click();
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'flaechen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tafel)),
  });
  await page.keyboard.press('Escape');
  await page.getByRole('complementary').getByText('Flächen', { exact: true }).click();
  await showSheet(page);

  const blocks = page.locator('.preview-frame .ps-tafel .ps-block');
  await expect(blocks).toHaveCount(2);
  const [left, right] = await blocks.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().toJSON()));
  // On screen, after the preview's scaling: a whole pixel of overlap at the least.
  expect(left.right - right.left).toBeGreaterThanOrEqual(1);
});

/**
 * A Lied is pasted whole, and every line that comes back is one row.
 *
 * Held here: an empty Lied shows an empty Strophe and Refrain to begin in; a
 * song pasted without a blank line is cut into its Refrain and its Strophen,
 * and the box is empty again after, as every box is; a line sung four times
 * is one row and says so; and the paper writes the song out as it is sung —
 * the Refrain every time, on its own ground — with the headings and the „2×"
 * as the dialog asks. The test after this one changes the song.
 */
test('a Lied holds a repeated line once, and prints the song written out', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Lied/);
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await page.keyboard.type('Laternenlied');
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);
  // Its box stands where every other template's does: above the Sammlung's name.
  const songBox = page.getByLabel('Liedzeile eingeben');
  const box = await songBox.boundingBox();
  const head = await page.locator('.collection-head').boundingBox();
  expect(box!.y).toBeLessThan(head!.y);
  // Empty, it shows the parts to begin in, the way an empty Tafel shows its grid.
  await expect(page.locator('.song__head h3')).toHaveText(['Strophe 1', 'Refrain']);
  await expect(page.getByText('Noch keine Zeile.')).toHaveCount(2);

  const refrain = ['Ich geh mit meiner Laterne', 'Dort oben leuchten die Sterne', 'Hier unten leuchten wir'];
  const rab = 'Rabimmel, rabammel, rabum';
  const verse = (line: string) => [line, rab, line, rab];
  const text = [
    ...refrain, ...verse('Mein Licht geht aus'), ...refrain, ...verse('Mein Licht ist klein'), ...refrain,
  ].join('\n');
  await songBox.fill(text);
  await page.getByRole('button', { name: 'Übersetzen' }).click();

  await expect(page.locator('.song__head h3'))
    .toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain']);
  await expect(songBox).toHaveValue('');
  // The first Refrain open, the two after it folded: the same rows, not drawn again.
  await expect(page.locator('.song__folded')).toHaveText(Array(2).fill('Refrain · 3 Zeilen · aufklappen'));
  await expect.poll(async () => (await readSentences(page)).length).toBe(6);

  // A line is its symbols: nothing to name it by, the words are under them.
  const rabRows = page.locator(`.row[aria-label="${rab}"]`);
  await expect(rabRows).toHaveCount(4);
  await expect(rabRows.locator('.row__sung')).toHaveText(Array(4).fill('4×'));
  await expect(page.locator('.song .row__title')).toHaveCount(0);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title')).toHaveText('Laternenlied');
  await expect(sheet.locator('.ps-song-part')).toHaveCount(5);
  await expect(sheet.locator('.ps-song-part--refrain')).toHaveCount(3);
  await expect(sheet.locator('.ps-song-head'))
    .toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain']);
  await expect(sheet.locator('.ps-song-line')).toHaveCount(17);
  await expect(sheet.locator('.ps-song-times')).toHaveCount(0);

  // What is on the sheet is the Lied's „Gestaltung", set once for every paper.
  await openLook(page);
  await page.getByLabel('Wiederholte Zeilen nur einmal, mit Anzahl (2×, 3× …)').check();
  await expect(sheet.locator('.ps-song-times')).toHaveText(['2×', '2×']);
  await expect(sheet.locator('.ps-song-line')).toHaveCount(13);

  // The Refrain written out where it is first sung, a reference after that.
  await page.getByLabel('Refrain nur einmal ausschreiben, danach „↻ Refrain“').check();
  await expect(sheet.locator('.ps-song-part--refrain')).toHaveCount(1);
  await expect(sheet.locator('.ps-song-again')).toHaveText(['↻Refrain', '↻Refrain']);
  await page.getByLabel('Refrain nur einmal ausschreiben, danach „↻ Refrain“').uncheck();
  await expect(sheet.locator('.ps-song-part--refrain')).toHaveCount(3);

  await page.getByLabel('Überschriften drucken (Strophe, Refrain)').uncheck();
  await expect(sheet.locator('.ps-song-head')).toHaveCount(0);

  // The line as written, above its pictures, as a strip has it: off until
  // asked for, then on, and off again.
  await expect(sheet.locator('.ps-song-part .ps-caption')).toHaveCount(0);
  await page.getByLabel('Satztext drucken').check();
  await expect(sheet.locator('.ps-song-part .ps-caption')).toHaveCount(13);
  await page.getByLabel('Satztext drucken').uncheck();
  await expect(sheet.locator('.ps-song-part .ps-caption')).toHaveCount(0);

  // A song sheet is printed on A5 as often as on A4: the paper is the Lied's to choose.
  await backToPrint(page);
  const pages = await sheet.locator('.ps-page').count();
  await page.getByRole('button', { name: 'A5', exact: true }).click();
  await expect.poll(() => sheet.locator('.ps-page').count()).toBeGreaterThan(pages);
  await showMaterial(page);

});

/**
 * A Lied is changed where it stands, the way the box only ever adds.
 *
 * The box puts a line at the end of the last Strophe; „✎ Text" writes one
 * part again, keeping the rows of the lines it keeps; „+ Strophe" is followed
 * by the Refrain as the Strophen before it are; × takes a Refrain out where it
 * is sung there, and „+ Refrain" sings it once more.
 */
test('a Lied grows and shrinks part by part', async ({ page }) => {
  await pickTemplate(page, /^Lied/);
  const refrain = ['Ich geh mit meiner Laterne', 'Hier unten leuchten wir'];
  const rab = 'Rabimmel, rabammel, rabum';
  const songBox = page.getByLabel('Liedzeile eingeben');
  await songBox.fill([...refrain, 'Mein Licht geht aus', rab, ...refrain, 'Mein Licht ist klein', rab, ...refrain].join('\n'));
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  const heads = page.locator('.song__head h3');
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain']);
  await expect.poll(async () => (await readSentences(page)).length).toBe(5);
  const rabId = (await readSentences(page)).find((row) => row.rawInput === rab)!.id;

  // The box adds, at the end of the last Strophe, and is empty again.
  await songBox.fill('Mein Licht ist hell');
  await songBox.press('Enter');
  await expect(songBox).toHaveValue('');
  const strophe2 = page.getByRole('region', { name: 'Strophe 2' });
  await expect(strophe2.locator('.row')).toHaveCount(3);
  await expect(strophe2.locator('.row').last()).toHaveAttribute('aria-label', 'Mein Licht ist hell');

  // One part as text: what changes is said before it is taken, and a line it
  // keeps keeps its row.
  await page.getByRole('button', { name: 'Strophe 2 als Text bearbeiten' }).click();
  const part = page.getByLabel('Strophe 2 als Text bearbeiten', { exact: true }).and(page.locator('textarea'));
  await expect(part).toHaveValue(`Mein Licht ist klein\n${rab}\nMein Licht ist hell`);
  await part.fill(`Mein Licht ist klein\n${rab}`);
  await expect(page.getByText('Bei „Fertig“: 1 entfernt.')).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(strophe2.locator('.row')).toHaveCount(2);
  await expect.poll(async () => (await readSentences(page)).map((row) => row.rawInput)).not.toContain('Mein Licht ist hell');
  expect((await readSentences(page)).find((row) => row.rawInput === rab)!.id).toBe(rabId);

  // A new Strophe is written whole, in the field „✎ Text" opens, and the
  // Refrain follows it as it follows the others.
  await page.getByRole('button', { name: '+ Strophe' }).click();
  const written = page.getByRole('textbox', { name: 'Strophe 3 als Text bearbeiten' });
  await expect(written).toBeFocused();
  await written.fill(`Ich trag mein Licht\n${rab}`);
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain', 'Strophe 3', 'Refrain']);
  await expect(page.getByRole('region', { name: 'Strophe 3' }).locator('.row')).toHaveCount(2);
  await expect.poll(async () => (await readSentences(page)).length).toBe(6);

  // The Refrain out where it is sung last — asked first, and said that it
  // stays where else it is sung — and sung once more.
  await page.getByRole('button', { name: 'Refrain löschen' }).last().click();
  const ask = page.getByRole('dialog');
  await expect(ask).toContainText('„Refrain“ wird hier nicht mehr gesungen, an den 3 anderen Stellen schon.');
  await ask.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(heads).toHaveCount(7);
  await page.getByRole('button', { name: 'Refrain löschen' }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain', 'Strophe 3']);
  await page.getByRole('button', { name: '+ Refrain' }).click();
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain', 'Strophe 3', 'Refrain']);
  await expect.poll(async () => (await readSentences(page)).length).toBe(6);

  // A Strophe out takes with it the lines only it had.
  await page.getByRole('button', { name: 'Strophe 1 löschen' }).click();
  await expect(page.getByRole('dialog')).toContainText('„Strophe 1“ und die Zeilen darin werden aus dem Lied gelöscht.');
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(heads).toHaveText(['Refrain', 'Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain']);
  await expect.poll(async () => (await readSentences(page)).map((row) => row.rawInput)).not.toContain('Mein Licht geht aus');

  // Anywhere in between: a Strophe after the first Refrain, numbered by where it stands.
  await page.getByRole('button', { name: 'Strophe an Stelle 2 einfügen' }).click();
  await page.getByRole('textbox', { name: 'Strophe 1 als Text bearbeiten' }).fill('Ein Lichtermeer');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain', 'Strophe 3', 'Refrain']);
  await expect(page.getByRole('region', { name: 'Strophe 1' }).locator('.row'))
    .toHaveAttribute('aria-label', 'Ein Lichtermeer');
  // And the Refrain sung between two Strophen.
  await page.getByRole('button', { name: 'Refrain an Stelle 5 einfügen' }).click();
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain', 'Refrain', 'Strophe 3', 'Refrain']);
});

/*
 * Whether the METACOM notice prints is the household's, in a Lied as anywhere.
 * A Lied keeps its print to itself, and the notice — which the Sammlung does
 * not keep — fell back off on the next change, or would not stay ticked.
 */
test('the copyright notice stays ticked in a Lied while other settings change', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await pickTemplate(page, /^Lied/);
  await page.getByLabel('Liedzeile eingeben').fill('Ich geh mit meiner Laterne\nUnd meine Laterne mit mir');
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  await showSheet(page);

  const notice = page.getByLabel('Copyright-Hinweis drucken');
  await notice.check();
  await page.getByRole('button', { name: 'Quer' }).click();
  await page.getByLabel('Symbolgröße').fill('20');
  await expect(notice).toBeChecked();
  await expect(page.locator('.print-view .ps-attribution').first()).toContainText('METACOM Symbole © Annette Kitzinger');

  await page.reload();
  await showSheet(page);
  await expect(page.getByLabel('Copyright-Hinweis drucken')).toBeChecked();
});

/**
 * A Plauderbuch is written page by page, as the Plauderplan-Drehbuch is laid
 * out: a question on each page, the Aussagen to choose from under it.
 *
 * Held here: an Aussage is one card with the picture of its last word and the
 * whole line under it; the box at the top writes onto the outlined page, and
 * „+ Seite" makes the next one the box's; „✎ Text" writes a page's Aussagen
 * again and keeps the card of a line it keeps; on paper each page is a
 * sheet with its question on the band, a free field once, and a field for
 * each Aussage, going on to another sheet when there are more than six; the
 * cards follow on sheets of their own, which carry no footer and are not
 * counted in the page numbers; the paper opens A5 across.
 */
test('a Plauderbuch is written page by page, and prints its pages and the cards to cut', async ({ page }) => {
  await pickTemplate(page, /^Plauderbuch/);
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);
  await expect(page.getByText('Noch keine Aussagen.')).toBeVisible();
  await expect(page.locator('.empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Andere Vorlage wählen' })).toBeVisible();

  await page.getByRole('button', { name: '✎ Frage' }).click();
  await page.getByLabel('Frage', { exact: true }).fill('Was ich erzählen will');
  await page.getByLabel('Frage', { exact: true }).press('Enter');
  const first = page.getByRole('region', { name: 'Was ich erzählen will' });
  await expect(first.locator('.talk__question')).toHaveText('Was ich erzählen will');
  await expect(first).toHaveClass(/talk__page--target/);

  await page.getByLabel('Aussage hinzufügen').fill('vom Morgenkreis\nvom Essen');
  await page.getByLabel('Aussage hinzufügen').press('Enter');
  await expect(first.locator('.word__name')).toHaveText(['vom Morgenkreis', 'vom Essen']);
  const essen = await readSentences(page).then((rows) => rows.find((r) => r.rawInput === 'vom Essen'));
  expect(essen?.slots).toHaveLength(1);
  expect(essen?.slots[0]?.sourceToken).toBe('Essen');

  // A new page is where the box writes next. Its region is named by its place, having no question.
  await page.getByRole('button', { name: '+ Seite' }).click();
  const second = page.getByRole('region', { name: 'Seite 2' });
  await expect(second).toHaveClass(/talk__page--target/);
  await page.getByLabel('Aussage hinzufügen').fill('fertig');
  await page.getByLabel('Aussage hinzufügen').press('Enter');
  await expect(second.locator('.word__name')).toHaveText(['fertig']);
  await expect(first.locator('.word__name')).toHaveCount(2);

  // As text: one dropped, the rest reordered and added to — the kept keep their cards.
  await first.getByRole('button', { name: 'Aussagen von „Was ich erzählen will“ als Text bearbeiten' }).click();
  const text = page.getByRole('textbox', { name: 'Aussagen von „Was ich erzählen will“ als Text bearbeiten' });
  await expect(text).toHaveValue('vom Morgenkreis\nvom Essen');
  const more = ['vom Essen', 'vom Spielen', 'vom Turnen', 'von der Pause', 'vom Malen', 'vom Singen', 'vom Ausflug'];
  await text.fill(more.join('\n'));
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(first.locator('.word__name')).toHaveText(more);
  const after = await readSentences(page);
  expect(after.find((row) => row.rawInput === 'vom Essen')!.id).toBe(essen!.id);
  expect(after.map((row) => row.rawInput)).not.toContain('vom Morgenkreis');

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('size: 210mm 148mm');
  // Seven Aussagen go on over two sheets, the question again on the second and no second free field.
  const pages = sheet.locator('.ps-talk');
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(0).locator('.ps-talk__question')).toHaveText('Was ich erzählen will');
  await expect(pages.nth(1).locator('.ps-talk__question')).toHaveText('Was ich erzählen willweiter');
  await expect(sheet.locator('.ps-talk__field--free')).toHaveCount(2);
  expect(await pages.evaluateAll((all) => all.map((one) =>
    one.querySelectorAll('.ps-talk__fields .ps-talk__field').length))).toEqual([6, 1, 1]);
  await expect(sheet.locator('.ps-talk-cut .ps-talk__word')).toHaveText([...more, 'fertig']);

  // The footer as everywhere — on the book's pages only.
  await page.getByLabel('Seitenzahlen drucken').check();
  await expect(sheet.locator('.ps-page__n')).toHaveText(['Seite 1 von 3', 'Seite 2 von 3', 'Seite 3 von 3']);
  expect(await sheet.locator('.ps-page').evaluateAll((all) => all
    .filter((one) => one.querySelector('.ps-talk-cut'))
    .map((one) => one.querySelector('.ps-foot') === null))).not.toContain(false);

  // A page taken out goes with its cards.
  await showMaterial(page);
  await second.getByRole('button', { name: '„Seite 2“ löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.locator('.talk__page')).toHaveCount(1);
  await expect.poll(async () => (await readSentences(page)).map((row) => row.rawInput)).not.toContain('fertig');
});
