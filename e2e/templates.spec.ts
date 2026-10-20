import { expect, test, type Page } from '@playwright/test';
import { idForTerm, mockArasaac, readSentences } from './arasaac-mock.ts';
import { backToPrint, openLook, showMaterial, pickTemplate, showSheet, translate } from './helpers.ts';
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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await page.keyboard.type('Karten');
  await pickTemplate(page, /^Wortkarten/);
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
test('an Einkaufsliste prints its three sheets, and the cart holds its zones', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.getByLabel('Name des Materials')).toBeFocused();

  await pickTemplate(page, /^Einkaufsliste/);

  await page.getByLabel('Wörter hinzufügen').fill('Apfel');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  await expect(page.locator('.word__name')).toHaveText(['Apfel']);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');

  // The board first: if this is not there the template never took, and every
  // count below would fail for a reason that has nothing to do with printing.
  await expect(sheet.locator('.ps-board')).toHaveCount(1);
  // Three sheets: the board, the cards, the places.
  await expect(sheet.locator('.ps-page')).toHaveCount(3);

  // Fifteen to shop from and fifteen in the cart — measured, not chosen.
  await expect(sheet.locator('.ps-board > .ps-zones .ps-zone')).toHaveCount(15);
  await expect(sheet.locator('.ps-zones--cart .ps-zone')).toHaveCount(15);

  // A card carries no word; a place carries the word and the picture.
  await expect(sheet.locator('.ps-cut .ps-card__label')).toHaveCount(0);
  await expect(sheet.locator('.ps-place__word')).toHaveText(['Apfel']);

  // The basket contains its zones, with air on every side.
  const basket = await sheet.locator('.ps-cart__art path').first().boundingBox();
  const first = await sheet.locator('.ps-zones--cart .ps-zone').first().boundingBox();
  const last = await sheet.locator('.ps-zones--cart .ps-zone').last().boundingBox();
  expect(first!.x).toBeGreaterThan(basket!.x);
  expect(first!.y).toBeGreaterThan(basket!.y);
  expect(last!.x + last!.width).toBeLessThan(basket!.x + basket!.width);
  expect(last!.y + last!.height).toBeLessThan(basket!.y + basket!.height);
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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();

  await pickTemplate(page, /^Tafel/);
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
  await expect(page.locator('.board-head')).toContainText('Feld 63,3 × 131,7 mm');
  const shape = (await cells.first().boundingBox())!;
  expect(shape.height / shape.width).toBeCloseTo(131.7 / 63.3, 1);
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
  await expect(page.getByText('Feld: 63,3 × 131,7 mm.')).toBeVisible();
  await expect(page.getByText('Karte zum Ausschneiden:')).toHaveCount(0);
  /* And nothing on it is cut. The switch is not offered here — a Tafel is
     laminated whole — but the setting is one remembered list shared by every
     template, so an answer given on a card sheet used to reach this paper
     anyway and draw a dashed line through every field. */
  await expect(page.getByLabel('Schnittlinien')).toHaveCount(0);
  await expect(sheet.locator('.ps-sheet--cutlines')).toHaveCount(0);
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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await pickTemplate(page, /^Tafel/);

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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await pickTemplate(page, /^Tafel/);
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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await pickTemplate(page, /^Tafel/);
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
  const airInput = page.getByLabel('Rand um jede Karte');
  await expect(airInput).toHaveValue('5');
  await airInput.fill('3');
  await expect(printed.nth(0).locator('.ps-block')).toHaveCount(1);
  // Kept by the Tafel: there after the page is loaded again.
  await page.reload();
  await showSheet(page);
  await expect(page.getByLabel('Rand um jede Karte')).toHaveValue('3');
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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await page.keyboard.type('Waffeln (5–6 Stück)');

  await pickTemplate(page, /^Rezept/);
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
  await expect(page.getByLabel('Name des Materials')).toBeFocused();
  await page.keyboard.type('Laternenlied');

  await pickTemplate(page, /^Lied/);
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

  // What is on the sheet is the Lied's „Aussehen", set once for every paper.
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
