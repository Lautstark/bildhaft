import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

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
/** This product opens with the sidebar put away, so the controls are behind it. */
async function showSidebar(page: Page): Promise<void> {
  const reveal = page.getByTitle('Seitenleiste einblenden');
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
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
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await expect(page.getByLabel('Name der Sammlung')).toBeFocused();
  await page.keyboard.type('Karten');
  await page.getByRole('button', { name: /Wortkarten/ }).click();
  /* Nothing is asserted here on purpose: an empty Sammlung shows its empty
     state, so the host the card wall wrote its layout onto is not even in the
     page yet. Which is the shape of the defect — it is written on a node
     nobody is looking at and read on the next one that is. */

  // Back to the first one. Its rows are rows again.
  await showSidebar(page);
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
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await expect(page.getByLabel('Name der Sammlung')).toBeFocused();

  const tile = page.getByRole('button', { name: /^Einkaufsliste/ });
  await tile.click();
  // Said out loud, because everything below fails in the same way when the
  // template did not take, and for a completely different reason.
  await expect(tile).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Wörter hinzufügen').fill('Apfel');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  await expect(page.locator('.word__name')).toHaveText(['Apfel']);

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
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
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await expect(page.getByLabel('Name der Sammlung')).toBeFocused();

  const tile = page.getByRole('button', { name: /^Tafel/ });
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');

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
  // row, so 3 × 2 keeps them and the twelve fields become six.
  await page.getByLabel('Spalten').fill('3');
  await page.getByLabel('Zeilen').fill('2');
  await expect(cells).toHaveCount(6);
  await expect(page.locator('.board .word__name')).toHaveText(['Banane', 'Apfel']);

  // The paper: six fields, two with a card, four free and drawn anyway.
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-tafel')).toHaveCount(1);
  await expect(sheet.locator('.ps-tafel .ps-card')).toHaveCount(6);
  await expect(sheet.locator('.ps-tafel .ps-card--empty')).toHaveCount(4);
  await expect(sheet.locator('.ps-tafel .ps-card__label')).toHaveText(['Banane', 'Apfel']);
  // A free field is exactly the size of a full one, or the grid is not a grid.
  const full = await sheet.locator('.ps-tafel .ps-card').first().boundingBox();
  const free = await sheet.locator('.ps-tafel .ps-card--empty').first().boundingBox();
  expect(Math.round(free!.width)).toBe(Math.round(full!.width));
  expect(Math.round(free!.height)).toBe(Math.round(full!.height));
  // The grid is the Sammlung's, so the dialog does not offer to change it.
  await expect(page.getByLabel('Spalten')).toHaveCount(1);
});

/**
 * The drag that stopped working after the first one.
 *
 * Not a bug in the drag: the first card dropped made every row of the grid
 * as tall as a card, the tray went below the fold, and the second card was
 * dragged from where it could not be seen — a page does not scroll under a
 * drag in any useful way. So the tray is a dock at the foot of the window and
 * a field with a card in it is barely taller than one without. Held at the
 * suite's ordinary window size on purpose, with a Tafel as full as a real one:
 * the failure only shows when the grid is taller than the screen.
 */
test('every card of a full Tafel can be dragged from the tray, one after the other', async ({ page }) => {
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await page.getByRole('button', { name: /^Tafel/ }).click();

  const names = Array.from({ length: 24 }, (_, i) => `Wort${i + 1}`);
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill(names.join('\n'));
  await bar.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveCount(24);
  await page.getByLabel('Spalten').fill('6');
  await page.getByLabel('Zeilen').fill('4');
  const cells = page.locator('.board .cell');
  await expect(cells).toHaveCount(24);

  const viewport = page.viewportSize()!;
  for (const [i, name] of names.entries()) {
    const card = page.locator('.tray .board-card')
      .filter({ has: page.locator('.word__name', { hasText: new RegExp(`^${name}$`) }) });
    // The tray is on screen before every drag, however tall the grid has grown.
    const tray = await page.locator('.tray').boundingBox();
    expect(tray!.y + tray!.height).toBeLessThanOrEqual(viewport.height + 1);
    await card.locator('.word__pic').dragTo(cells.nth(i));
    await expect(cells.nth(i).locator('.word__name')).toHaveText(name);
  }
  await expect(page.locator('.tray .word__name')).toHaveCount(0);

  // Back out by dragging onto the tray, and a swap between two full fields.
  await cells.nth(0).locator('.board-card').dragTo(page.locator('.tray'));
  await expect(page.locator('.tray .word__name')).toHaveText(['Wort1']);
  await cells.nth(2).locator('.board-card').dragTo(cells.nth(4));
  await expect(cells.nth(2).locator('.word__name')).toHaveText('Wort5');
  await expect(cells.nth(4).locator('.word__name')).toHaveText('Wort3');
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
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await page.getByRole('button', { name: /^Tafel/ }).click();
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
 * Held on screen and on paper, because the two draw it from one answer and
 * a group that is a block on screen and a row of tiles on paper is the
 * printout nobody asked for.
 */
test('fields of a Tafel can be coloured as a group, on screen and on paper', async ({ page }) => {
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await page.getByRole('button', { name: /^Tafel/ }).click();
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Rot');
  await bar.press('Enter');
  await page.getByRole('button', { name: '„Rot“ ins erste freie Feld legen' }).click();

  const cells = page.locator('.board .cell');
  // Yellow in hand: two fields side by side, one with the card and one free.
  await page.getByRole('button', { name: 'Gelb' }).click();
  await cells.nth(0).click();
  await cells.nth(1).click();
  await expect(page.locator('.cell--zoned')).toHaveCount(2);
  // The brush took the click; the card's picker did not open.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // One block: the shared corners square, the outer ones round.
  await expect(cells.nth(0)).toHaveCSS('border-top-right-radius', '0px');
  await expect(cells.nth(0)).toHaveCSS('border-top-left-radius', '12px');
  await expect(cells.nth(1)).toHaveCSS('border-top-left-radius', '0px');
  // The brush put down, a click on a field is a click on the card again.
  await page.keyboard.press('Escape');
  await cells.nth(2).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cell--zoned')).toHaveCount(2);

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  const printed = page.locator('.preview-frame .ps-tafel .ps-card');
  await expect(printed.nth(0)).toHaveCSS('background-color', 'rgb(255, 243, 191)');
  await expect(printed.nth(1)).toHaveCSS('background-color', 'rgb(255, 243, 191)');
  await expect(printed.nth(2)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(printed.nth(0)).toHaveCSS('border-top-right-radius', '0px');
  // The card stays white on its colour.
  await expect(printed.nth(0).locator('.ps-card__frame')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
