import { expect, test, type Locator, type Page } from '@playwright/test';
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
 *
 * The colour is dragged onto the fields like a card, and a drag across
 * several fields colours them all. A drag rather than a mode, because a mode
 * had to be left before a field could be filled or a card moved — and it was
 * not, so with a colour chosen nothing else worked. Held on screen and on
 * paper, because the two draw the block from one answer.
 */
test.describe('colour on a Tafel', () => {
  // Tall, for the same reason the full Tafel above is: the tray is under the
  // grid, and the last drag here goes from one to the other.
  test.use({ viewport: { width: 1280, height: 1500 } });

test('fields of a Tafel can be coloured as a group, on screen and on paper', async ({ page }) => {
  await showSidebar(page);
  await page.getByRole('button', { name: '+ Neue Sammlung' }).click();
  await page.getByRole('button', { name: /^Tafel/ }).click();
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Rot');
  await bar.press('Enter');
  await page.getByRole('button', { name: '„Rot“ ins erste freie Feld legen' }).click();

  const cells = page.locator('.board .cell');
  /* Every drag here is the mouse itself, moved in steps, rather than
     Playwright's dragTo(): a colour is applied on the way, on every field the
     pointer crosses, and dragTo() jumps. It also stops working for the rest
     of a test once a hand-driven drag has happened, which is its business. */
  const drag = async (source: Locator, ...targets: Locator[]) => {
    const from = (await source.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (const target of targets) {
      const to = (await target.boundingBox())!;
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    }
    await page.mouse.up();
  };
  const yellow = page.getByRole('button', { name: 'Gelb' });
  // Yellow onto two fields side by side, one with the card and one free — and
  // straight down from the swatch, so no field on the way takes it too.
  await drag(yellow, cells.nth(3), cells.nth(2), cells.nth(1), cells.nth(0));
  await expect(page.locator('.cell--zoned')).toHaveCount(4);
  await drag(page.getByRole('button', { name: 'Keine Farbe' }), cells.nth(3), cells.nth(2));
  await expect(page.locator('.cell--zoned')).toHaveCount(2);
  // One block: the shared corners square, the outer ones round, and the
  // block stepped in by half a gutter only where it ends.
  const zone = (i: number) => cells.nth(i).locator('.cell__zone');
  await expect(zone(0)).toHaveCSS('border-top-right-radius', '0px');
  await expect(zone(0)).toHaveCSS('border-top-left-radius', '12px');
  await expect(zone(1)).toHaveCSS('border-top-left-radius', '0px');
  // Where the block goes on, the layer reaches a hair past its field, so the
  // two layers overlap and no seam shows between them.
  await expect(zone(0)).toHaveCSS('right', '-1px');
  await expect(zone(0)).toHaveCSS('left', '4px');

  // One drag across three fields colours all three: down the right edge,
  // then along the second row.
  await drag(yellow, cells.nth(3), cells.nth(7), cells.nth(6), cells.nth(5), cells.nth(4));
  await drag(page.getByRole('button', { name: 'Keine Farbe' }), cells.nth(3), cells.nth(7));
  await expect(page.locator('.cell--zoned')).toHaveCount(5);

  // The eraser takes a colour off the same way.
  await drag(page.getByRole('button', { name: 'Keine Farbe' }), cells.nth(3), cells.nth(2), cells.nth(1));
  await expect(page.locator('.cell--zoned')).toHaveCount(4);

  // A colour of one's own becomes a swatch to drag.
  await page.getByLabel('Eigene Farbe wählen').fill('#c8e6ff');
  await drag(page.getByRole('button', { name: 'Eigene Farbe #c8e6ff' }), cells.nth(3), cells.nth(7), cells.nth(11), cells.nth(10), cells.nth(9), cells.nth(8));
  await drag(page.getByRole('button', { name: 'Keine Farbe' }), cells.nth(3), cells.nth(7), cells.nth(11), cells.nth(10), cells.nth(9));
  await expect(zone(8)).toHaveCSS('background-color', 'rgb(200, 230, 255)');
  await expect(page.locator('.cell--zoned')).toHaveCount(5);

  // Nothing was put into a mode: the „+" of a coloured free field still opens the picker.
  await page.getByRole('button', { name: 'Neue Karte in Feld 5' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cell--zoned')).toHaveCount(5);
  // And a card is still dragged into a coloured field.
  await page.getByLabel('Wörter hinzufügen').fill('Blau');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  await drag(page.locator('.tray .board-card').filter({ hasText: 'Blau' }).locator('.word__pic'), cells.nth(4));
  await expect(cells.nth(4).locator('.word__name')).toHaveText('Blau');

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  const printed = page.locator('.preview-frame .ps-tafel .ps-card');
  await expect(printed.nth(0).locator('.ps-block')).toHaveCSS('background-color', 'rgb(255, 241, 184)');
  await expect(printed.nth(1).locator('.ps-block')).toHaveCount(0);
  await expect(page.locator('.preview-frame .ps-block')).toHaveCount(5);
  // The block steps in where it ends and not where it goes on, as on screen.
  const box = await printed.nth(0).locator('.ps-block').boundingBox();
  const cell = await printed.nth(0).boundingBox();
  expect(box!.x).toBeGreaterThan(cell!.x);
  // Downwards the block goes on, so the layer reaches to the field's edge and a hair past it.
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(cell!.y + cell!.height - 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(cell!.y + cell!.height + 2);
  // The card stays white on its colour.
  await expect(printed.nth(0).locator('.ps-card__frame')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  // And the air around a card is the Tafel's own 4 mm, named as air, not as a cut.
  await expect(page.getByLabel('Luft um jede Karte')).toHaveValue('4');
});
});
