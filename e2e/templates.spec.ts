import { expect, test, type Page } from '@playwright/test';
import { idForTerm, mockArasaac, readSentences } from './arasaac-mock.ts';
import { backToPrint, closePicker, openDing, pickPaper, pickTemplate, showMaterial, showSheet, translate, untilKept } from './helpers.ts';
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
  await page.getByLabel('Name des Materials').fill('Karten');
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
  /* The guide is the board's own setting now, made in the Zeile over the
     material — under „Seite", where the sheet's things live. */
  await openDing(page, 'Seite');
  await page.getByLabel('Anleitung drucken').uncheck();
  await showSheet(page);
  await expect(sheet.locator('.ps-guide')).toHaveCount(0);
  await expect(sheets).toHaveCount(3);
  await openDing(page, 'Seite');
  await page.getByLabel('Anleitung drucken').check();
  await showSheet(page);
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

  /* The paper is all it is asked, and the paper decides every millimetre —
     and the board brings no settings column at all any more: its look is set
     in the Zeile over the material, the sheet is only looked at. */
  await expect(page.locator('.print-view__panel')).toHaveCount(0);
  /* Green until it is told otherwise: a light page behind the board, as a
     Tafel's colour, the cart and the name in a darker green. The board's
     page only: the places and the cards stay white. */
  const bg = (at: number) => sheets.nth(at).evaluate((one) => getComputedStyle(one).backgroundColor);
  const stroke = () => sheet.locator('.ps-cart__art').evaluate((art) => getComputedStyle(art).stroke);
  expect(await bg(1)).toBe('rgb(217, 235, 211)');
  expect(await bg(2)).toBe('rgb(255, 255, 255)');
  expect(await stroke()).toBe('rgb(61, 125, 58)');
  await expect(sheets.nth(1).locator('.ps-title')).toHaveCSS('color', 'rgb(61, 125, 58)');
  expect(await sheets.nth(1).locator('.ps-zone').first()
    .evaluate((zone) => getComputedStyle(zone).backgroundColor)).toBe('rgb(255, 255, 255)');

  /* The Materialfarbe is set at the title and reaches the cart with it; the
     page's ground is its own row under „Seite", „keine" first. All of it in
     the Zeile over the material, and the open preview follows. */
  await showMaterial(page);
  await openDing(page, 'Titel');
  await page.getByRole('button', { name: 'Farbe Blau', exact: true }).click();
  await showSheet(page);
  await expect.poll(stroke).toBe('rgb(63, 136, 224)');
  await expect(sheets.nth(1).locator('.ps-title')).toHaveCSS('color', 'rgb(63, 136, 224)');
  await showMaterial(page);
  await openDing(page, 'Seite');
  await page.getByRole('button', { name: 'Seitenfarbe: Kein' }).click();
  await showSheet(page);
  await expect.poll(() => bg(1)).toBe('rgb(255, 255, 255)');
  await showMaterial(page);
  await openDing(page, 'Seite');
  await page.getByRole('button', { name: 'Seitenfarbe Grün' }).click();
  await showSheet(page);
  await expect.poll(() => bg(1)).toBe('rgb(216, 242, 210)');

  // Its name over the board is set as everywhere: size, colour, a line.
  await showMaterial(page);
  await openDing(page, 'Titel');
  await page.getByLabel('Linie darunter').check();
  await page.getByLabel('Schriftgröße', { exact: true }).fill('20');
  await page.getByLabel('Schriftgröße', { exact: true }).press('Tab');
  await showSheet(page);
  await expect(sheet.locator('.ps-title').last()).toHaveCSS('border-bottom-style', 'solid');
  /* The paper is picked in the overlay's head — the pill that names it. */
  const paper = async (name: string) => {
    const pop = page.locator('.paper-pick__pop');
    if (!(await pop.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Papier wählen' }).click();
    }
    await pop.getByRole('button', { name, exact: true }).click();
  };
  await paper('A5');
  await expect(sheet.locator('.ps-title').last()).toHaveCSS('border-bottom-style', 'solid');
  await paper('A4');
  /* NaN until the replanned sheet is back, so a poll simply asks again. */
  const symbolMm = () => sheet.locator('.ps-cut .ps-card__img').first()
    .evaluate((img) => {
      const whole = img.closest<HTMLElement>('.ps-sheet');
      return whole ? img.getBoundingClientRect().width / whole.getBoundingClientRect().width * whole.offsetWidth * 25.4 / 96 : Number.NaN;
    });
  await expect.poll(symbolMm).toBeCloseTo(20, 0);
  // A card to cut is square, its cut line included: the dashed border used to sit outside the padding top and bottom only.
  const card = await sheet.locator('.ps-cut .ps-card').first().evaluate((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height }));
  expect(card.h).toBeCloseTo(card.w, 0);
  for (const [paperName, mm] of [['A5', 14]] as const) {
    await paper(paperName);
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
  /* The paper is picked at the head's pill, docked sheet or not. */
  await page.getByRole('button', { name: 'Papier wählen' }).click();
  await page.locator('.paper-pick__pop').getByRole('button', { name: 'A5', exact: true }).click();
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
  /* Der Standard ist quer; die Rechnung hier ist die des hohen Blatts. */
  await pickPaper(page, 'Hoch');
  await page.getByLabel('Spalten').fill('3');
  await page.getByRole('button', { name: 'Eine Zeile weniger' }).click();
  await expect(cells).toHaveCount(6);
  await expect(page.locator('.board .word__name')).toHaveText(['Banane', 'Apfel']);
  // A field has its paper's shape: three across and two down on A4 upright
  // is a field taller than wide, as the Symbol menu's line says.
  await openDing(page, 'Symbol');
  await expect(page.locator('.ding__mess')).toContainText('Karte 63 × 137 mm');
  await page.keyboard.press('Escape');
  /* Die Arbeitsfläche zeigt Struktur, nicht Papierform: ihre Felder stehen
     quadratisch, die Proportionen stehen im Readout und auf dem Papier. */
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
  await expect(page.locator('.print-dock').getByLabel('Spalten')).toHaveCount(0);
  await openDing(page, 'Symbol');
  await expect(page.locator('.ding__mess')).toContainText('Karte 63 × 137 mm');
  await page.keyboard.press('Escape');
  /* And nothing on it is cut. The switch is not offered here — a Tafel is
     laminated whole — but the setting is one remembered list shared by every
     template, so an answer given on a card sheet used to reach this paper
     anyway and draw a dashed line through every field. */
  await expect(page.getByLabel('Schnittlinien')).toHaveCount(0);
  await expect(sheet.locator('.ps-sheet--cutlines')).toHaveCount(0);
  /* A free field prints as nothing until asked; asked, each free field —
     and only those — gets its dashed place, inside the air as a frame is. */
  await expect(sheet.locator('.ps-card__place')).toHaveCount(0);
  await openDing(page, 'Tafel');
  await page.getByLabel('Leere Felder gestrichelt drucken').check();
  await expect(sheet.locator('.ps-tafel .ps-card--empty .ps-card__place')).toHaveCount(4);
  await expect(sheet.locator('.ps-card__place')).toHaveCount(4);
  // And it is this Tafel's: it is still there when the Tafel is opened again.
  await untilKept(page, 'markFreeFields', true);
  await untilKept(page, 'markFreeFields', true);
  await page.reload();
  await showSheet(page);
  await openDing(page, 'Tafel');
  await expect(page.getByLabel('Leere Felder gestrichelt drucken')).toBeChecked();
  await expect(page.locator('.preview-frame .ps-card__place')).toHaveCount(4);
  // The frame's thickness, corners and colour stand right under its check, not under this one.
  await openDing(page, 'Symbol');
  await page.getByLabel('Rahmen um jede Karte').check();
  await expect(page.locator('.ding__dep').getByRole('group', { name: 'Farbe' })).toBeVisible();
  await openDing(page, 'Tafel');
  await expect(page.getByRole('group', { name: 'Farbe' })).toHaveCount(0);
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

  // Back out with the card's ↓ — an empty tray is not on screen to drop on —
  // and a swap between two full fields. The tray returns with its first word.
  await cells.nth(0).locator('.board-card__move').click();
  await expect(page.locator('.tray .word__name')).toHaveText(['Wort1']);
  await cells.nth(2).locator('.board-card').dragTo(cells.nth(4));
  await expect(cells.nth(2).locator('.word__name')).toHaveText('Wort5');
  await expect(cells.nth(4).locator('.word__name')).toHaveText('Wort3');
});
});

/* Im Dunkeln stand das Wort einer Karte auf der Tafel dunkelgrau auf der
   dunklen Kachel: die Tafel trug noch die Schriftfarbe aus der Zeit, als ihr
   Grund Papier war. Ihr Wort ist so hell wie das einer Karte im Ablagefach. */
test('on a dark Tafel the words on the board are as bright as the ones in the tray', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Tafel/);
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Ball\nEimer');
  await bar.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveCount(2);
  await page.locator('.tray .board-card').first().locator('.word__pic').dragTo(page.locator('.board .cell').first());
  const onBoard = page.locator('.board .cell .word__name');
  await expect(onBoard).toHaveText('Ball');
  const color = (l: typeof onBoard) => l.evaluate((e) => getComputedStyle(e).color);
  expect(await color(onBoard)).toBe(await color(page.locator('.tray .word__name').first()));
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
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Apfel');
  await bar.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveText(['Apfel']);

  // In a field: its „+" is a line to type in, the picker one press further;
  // the picker opens on a card lying there, and closing it takes the card
  // away again and leaves the field free.
  await page.getByRole('button', { name: 'Neue Karte in Feld 3' }).click();
  await page.getByRole('button', { name: 'Bild suchen' }).click();
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

  // Nothing was put into a mode: a free field's „+" still opens its line to
  // type in, and a card is still dragged into a grouped field.
  await page.getByRole('button', { name: 'Neue Karte in Feld 2' }).click();
  await expect(page.getByLabel('Wort für Feld 2')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Wort für Feld 2')).toHaveCount(0);
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
  await openDing(page, 'Symbol');
  const airInput = page.getByLabel('Rand', { exact: true });
  await expect(airInput).toHaveValue('5');
  await airInput.fill('3');
  await expect(printed.nth(0).locator('.ps-block')).toHaveCount(1);
  // Kept by the Tafel: there after the page is loaded again.
  await untilKept(page, 'cutMarginMm', 3);
  await page.reload();
  await showSheet(page);
  await openDing(page, 'Symbol');
  await expect(page.getByLabel('Rand', { exact: true })).toHaveValue('3');
});
});

/**
 * A Zutat or a Hilfsmittel added by its part's „+", as a Wortkarte is: the
 * picture first, then, with the card opened again, its text in the picker.
 */
async function addRecipeCard(page: Page, part: 'Zutat' | 'Hilfsmittel', word: string, text?: string): Promise<void> {
  await page.getByRole('button', { name: `${part} hinzufügen` }).click();
  await page.getByLabel('Symbol suchen').fill(word);
  await page.locator('.picker__item', { hasText: word }).first().click();
  await closePicker(page);
  if (!text) return;
  await page.getByRole('button', { name: `Bild für „${word}“ ändern` }).click();
  await page.getByLabel('Text zum Symbol').fill(text);
  await page.getByRole('button', { name: 'Fertig' }).click();
}

/**
 * A Rezept is three parts, each filled where it stands, and the paper keeps
 * them apart.
 *
 * Held here: there is no box at the top; a Zutat is a Wortkarte, its picture
 * searched first and its text („2 Eier") written in the picker; a line written in „✎ Text" keeps its amount off the
 * lookup, so „325 ml Milch" gets the picture for „Milch"; the Schritte read
 * top to bottom in the order they were typed, numbered, which is the reverse
 * of a Satzstreifen; cards and Schritte are dragged into another order, and
 * the paper follows; and the paper carries the three headings, the numbers
 * and the name — and, with pictures too big for one page, goes on to a
 * second rather than shrinking.
 */
test('a Rezept takes each part where it stands, and prints them in order', async ({ page }) => {
  await sidebarReady(page);
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Rezept/);
  await page.getByLabel('Name des Materials').fill('Waffeln (5–6 Stück)');
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);

  const zutaten = page.getByRole('region', { name: 'Zutaten' });
  await addRecipeCard(page, 'Zutat', 'Eier', '2 Eier');
  await expect(zutaten.locator('.word__name')).toHaveText(['2 Eier']);

  await page.getByRole('button', { name: 'Zutaten als Text bearbeiten' }).click();
  const text = page.getByRole('textbox', { name: 'Zutaten als Text bearbeiten' });
  await expect(text).toHaveValue('2 Eier');
  await text.fill('2 Eier\n325 ml Milch');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(zutaten.locator('.word__name')).toHaveText(['2 Eier', '325 ml Milch']);
  const milch = await readSentences(page).then((rows) => rows.find((r) => r.rawInput === '325 ml Milch'));
  expect(milch?.slots[0]?.sourceToken).toBe('Milch');
  expect(milch?.slots[0]?.chosen).toBe(String(idForTerm('Milch')));

  const hilfsmittel = page.getByRole('region', { name: 'Hilfsmittel' });
  await addRecipeCard(page, 'Hilfsmittel', 'Schüssel');
  await expect(hilfsmittel.locator('.word__name')).toHaveText(['Schüssel']);
  await expect(zutaten.locator('.recipe__entry')).toHaveCount(2);

  // Two submissions, so the order is the one they were typed in and not a batch's.
  const schritte = page.getByRole('region', { name: 'Schritte' });
  await schritte.getByRole('button', { name: '+ Schritt' }).click();
  for (const [at, step] of ['Eier in die Schüssel', 'Rühren'].entries()) {
    await page.getByLabel('Neuer Schritt').fill(step);
    await page.getByLabel('Neuer Schritt').press('Enter');
    await expect(schritte.locator('.row')).toHaveCount(at + 1);
  }
  await expect(schritte.locator('.row__step')).toHaveText(['1', '2']);
  const steps = () => schritte.locator('.row__title').evaluateAll((fields) =>
    fields.map((field) => field.getAttribute('placeholder')));
  expect(await steps()).toEqual(['Eier in die Schüssel', 'Rühren']);

  // Dragged: a card as a whole, a Schritt by its number.
  await zutaten.locator('.recipe__entry').nth(1).dragTo(zutaten.locator('.recipe__entry').nth(0));
  await expect(zutaten.locator('.word__name')).toHaveText(['325 ml Milch', '2 Eier']);
  await schritte.locator('.row__step').nth(1).dragTo(schritte.locator('.slot').first());
  await expect.poll(steps).toEqual(['Rühren', 'Eier in die Schüssel']);
  await expect(schritte.locator('.row__step')).toHaveText(['1', '2']);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title')).toHaveText('Waffeln (5–6 Stück)');
  await expect(sheet.locator('.ps-recipe-head')).toHaveText(['Zutaten', 'Hilfsmittel', 'Schritte']);
  await expect(sheet.locator('.ps-recipe-cards').first().locator('.ps-card__label'))
    .toHaveText(['325 ml Milch', '2 Eier']);
  await expect(sheet.locator('.ps-recipe-step').first()).toContainText('Rühren');
  await expect(sheet.locator('.ps-recipe-step__n')).toHaveText(['1', '2']);
  await expect(sheet.locator('.ps-page')).toHaveCount(1);

  // Bigger pictures: the Schritte go on over the page at the size asked for.
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('60');
  await expect(sheet.locator('.ps-page')).toHaveCount(2);
  await expect(sheet.locator('.ps-page').nth(1).locator('.ps-recipe-step')).not.toHaveCount(0);
  const img = await sheet.locator('.ps-recipe-step .ps-card__img').last().evaluate((node) =>
    parseFloat(getComputedStyle(node).width));
  expect(img).toBeCloseTo(60 * 96 / 25.4, 0);

  // One colour for the strong things: picked at the title, it reaches the
  // Rezept's headings with it. And the title can be left off, as everywhere.
  const title = sheet.locator('.ps-title');
  await expect(title).toHaveCSS('border-bottom-style', 'solid');
  await openDing(page, 'Titel');
  await page.getByLabel('Eigene Farbe: Farbe').fill('#118833');
  await expect(title).toHaveCSS('color', 'rgb(17, 136, 51)');
  await page.getByLabel('Titel drucken').uncheck();
  await expect(title).toHaveCount(0);
});

/**
 * A Rezept is changed where it stands, the way a Lied is.
 *
 * Held here: an empty part says so, or offers its „+" card, and no second
 * „noch leer" box stands over the parts; the Schritte take lines under them; „✎ Text" writes a part again in the order of the
 * text, keeping the row of a line it keeps and taking out the one it drops;
 * and the paper is the Rezept's to choose, as a Lied's is.
 */
test('a Rezept is changed part by part, and chooses its paper', async ({ page }) => {
  await pickTemplate(page, /^Rezept/);
  await expect(page.getByRole('button', { name: 'Zutat hinzufügen' })).toBeVisible();
  await expect(page.getByText('Noch keine Schritte.')).toBeVisible();
  await expect(page.locator('.empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Andere Vorlage wählen' })).toBeVisible();

  const schritte = page.getByRole('region', { name: 'Schritte' });

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
  await openDing(page, 'Symbol');
  await expect(page.getByLabel('Symbolgröße')).toBeVisible();
  await expect(page.getByText('Karte zum Ausschneiden')).toHaveCount(0);
  await pickPaper(page, 'A5');
  await pickPaper(page, 'Quer');
  // Two A5 across, one under the other on an A4 standing up.
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('size: 210mm 297mm');
  await untilKept(page, 'orientation', 'landscape');
  await page.reload();
  await showSheet(page);
  await expect(page.getByRole('button', { name: 'Papier wählen' })).toContainText('A5 quer');
});

/**
 * A Rezept has the title line the other templates have: its name is the file,
 * the title is what the paper says, with symbols of its own. „Titel drucken"
 * prints both or neither. Each part is printed under a band in the Rezept's
 * colour. The title's symbols are not entries.
 */
test('a Rezept prints the title from its title line, and its parts under bands', async ({ page }) => {
  await pickTemplate(page, /^Rezept/);
  await page.getByLabel('Name des Materials', { exact: true }).fill('Bananenpfannkuchen Gruppe Igel');
  await addRecipeCard(page, 'Zutat', 'Eier', '2 Eier');
  await expect(page.getByRole('region', { name: 'Zutaten' }).locator('.recipe__entry')).toHaveCount(1);

  await page.getByLabel('Titel auf dem Papier').fill('Bananenpfannkuchen');
  await page.getByLabel('Titel auf dem Papier').press('Enter');
  await page.getByRole('button', { name: 'Symbol zum Titel hinzufügen' }).click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.locator('.picker__item', { hasText: 'Banane' }).first().click();
  await closePicker(page);
  await expect(page.getByRole('button', { name: 'Symbol im Titel ändern' }).locator('img')).toBeVisible();
  await expect(page.locator('.collection-head')).toContainText('1 Eintrag');
  await expect(page.getByLabel('Name des Materials', { exact: true })).toHaveValue('Bananenpfannkuchen Gruppe Igel');

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title .ps-title__pic img')).toBeVisible();
  await expect(sheet.locator('.ps-title')).toHaveText('Bananenpfannkuchen');
  await expect(sheet.locator('.ps-recipe-head')).toHaveText(['Zutaten']);
  /* The title's picture at the left edge, where the bands begin: the words'
     3 mm once caught the picture too (2026-10-28). */
  const left = async (selector: string) => (await sheet.locator(selector).first().boundingBox())!.x;
  expect(Math.abs(await left('.ps-title__pic') - await left('.ps-recipe-head'))).toBeLessThan(0.5);
  expect(await sheet.locator('.ps-recipe-head').first().evaluate((el) => getComputedStyle(el).color))
    .toBe('rgb(255, 255, 255)');

  await openDing(page, 'Titel');
  await page.getByLabel('Titel drucken').uncheck();
  await expect(sheet.locator('.ps-title')).toHaveCount(0);
  await expect(sheet.locator('.ps-title__pic')).toHaveCount(0);
  // Only for the paper, so Bearbeiten shows it only while it prints (her call, 2026-10-28).
  await expect(page.locator('main .title-line')).toHaveCount(0);

  // Symbol taken out and words emptied, the name prints alone.
  await openDing(page, 'Titel');
  await page.getByLabel('Titel drucken').check();
  await expect(page.locator('main .title-line')).toHaveCount(1);
  await showMaterial(page);
  await page.getByRole('button', { name: 'Symbol im Titel ändern' }).click();
  await page.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Symbol im Titel ändern' })).toHaveCount(0);
  await page.getByLabel('Titel auf dem Papier').fill('');
  await page.getByLabel('Titel auf dem Papier').press('Enter');
  await showSheet(page);
  await expect(sheet.locator('.ps-title')).toHaveText('Bananenpfannkuchen Gruppe Igel');
  await expect(sheet.locator('.ps-title__pic')).toHaveCount(0);
});

/*
 * A Rezept with the Anybook placeholder: a Zutat keeps its circle on its
 * card, and a Schritt is read as one — one circle under its number, none on
 * its pictures, so they keep their size and the row is no taller for them.
 */
test('a Rezept gives each Schritt one Anybook circle, under its number', async ({ page }) => {
  await pickTemplate(page, /^Rezept/);
  await addRecipeCard(page, 'Zutat', 'Eier', '2 Eier');
  const schritte = page.getByRole('region', { name: 'Schritte' });
  await schritte.getByRole('button', { name: '+ Schritt' }).click();
  await page.getByLabel('Neuer Schritt').fill('Eier in die Schüssel');
  await page.getByLabel('Neuer Schritt').press('Enter');
  await expect(schritte.locator('.row')).toHaveCount(1);
  await showSheet(page);

  const sheet = page.locator('.preview-frame');
  const pictures = () => sheet.locator('.ps-recipe-step .ps-card__img').evaluateAll((all) =>
    all.map((el) => (el as HTMLElement).offsetHeight));
  /* Measured once the sheet has settled: two readings alike. */
  let before = await pictures();
  await expect.poll(async () => { const now = await pictures(); const same = JSON.stringify(now) === JSON.stringify(before); before = now; return same; }).toBe(true);
  expect(before.length).toBeGreaterThan(0);

  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).check();
  const circles = (selector: string) => sheet.locator(selector).evaluateAll((all) =>
    all.map((el) => getComputedStyle(el.querySelector(':scope > .ps-any') ?? el).borderRadius === '50%'));
  await expect.poll(() => circles('.ps-recipe-cards .ps-card__img')).toEqual([true]);
  await expect.poll(() => circles('.ps-recipe-step__n')).toEqual([true]);
  expect(await circles('.ps-recipe-step .ps-card__img')).toEqual(before.map(() => false));
  await expect.poll(pictures).toEqual(before);
  // Under the number, not beside it or over the row's pictures.
  await expect.poll(() => sheet.locator('.ps-recipe-step__n').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const after = getComputedStyle(el.querySelector(':scope > .ps-any') ?? el);
    return box.top + parseFloat(after.top) * (box.height / (el as HTMLElement).offsetHeight) - box.bottom;
  })).toBeGreaterThan(0);
});

/*
 * The codes are set where the material is edited, not on the sheet (her
 * call, 2026-10-27), and the Anybook button is their one switch (2026-10-28):
 * on, every card that gets a code has a field „Stift sagt" under it and a
 * Schritt one in its head; off, Bearbeiten shows none of it. What is typed
 * there is what the sheet's code says; taken off with ✕, the sheet prints
 * none there. Off and on again, nothing is lost (her condition).
 */
test('a Rezept’s Anybook codes are set in Bearbeiten, under each card and in each Schritt’s head, and survive the button off and on', async ({ page }) => {
  await pickTemplate(page, /^Rezept/);
  await addRecipeCard(page, 'Zutat', 'Eier', '2 Eier');
  const schritte = page.getByRole('region', { name: 'Schritte' });
  await schritte.getByRole('button', { name: '+ Schritt' }).click();
  await page.getByLabel('Neuer Schritt').fill('Eier in die Schüssel');
  await page.getByLabel('Neuer Schritt').press('Enter');
  await expect(schritte.locator('.row')).toHaveCount(1);
  await showSheet(page);
  await expect(page.locator('main .any-pen')).toHaveCount(0);
  await expect(page.locator('.ding__chip[aria-label="Anybook"]')).toHaveClass(/ding__chip--add/);

  // Pressed while off, the button switches on as it opens (her call): no empty box to tick first.
  await openDing(page, 'Anybook');
  await expect(page.getByLabel('Anybook-Codes', { exact: true })).toBeChecked();
  await expect(page.locator('.ding__chip[aria-label="Anybook"]')).not.toHaveClass(/ding__chip--add/);
  const zutaten = page.getByRole('region', { name: 'Zutaten' });
  await expect(zutaten.locator('.word .any-peek')).toHaveCount(1);
  await expect(schritte.locator('.row__head .any-pen')).toHaveCount(1);
  // A Schritt's pictures carry no code of their own: the Schritt has one.
  await expect(schritte.locator('.slot .any-peek')).toHaveCount(0);

  const sheet = page.locator('.preview-frame');
  // Under a card only the words (too small to write in, her call): pressed,
  // the card's dialog opens with the caret in „Stift sagt".
  const peek = zutaten.locator('.word .any-peek');
  await expect(peek).toHaveText('2 Eier');
  await peek.click();
  const said = page.getByRole('dialog').getByLabel('Stift sagt');
  await expect(said).toBeFocused();
  await said.fill('zwei Eier');
  await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();
  await expect(sheet.locator('.ps-recipe-cards .ps-any').first()).toHaveAttribute('data-said', 'zwei Eier');
  await expect(peek).toHaveText('zwei Eier');
  await expect(peek).toHaveClass(/any-peek--own/);

  const step = schritte.locator('.row__head .any-pen');
  await expect(step.locator('input')).toHaveValue('Eier in die Schüssel');
  await step.getByRole('button', { name: 'Code entfernen' }).click();
  await expect(step.getByRole('button', { name: 'Code wieder drucken' })).toBeVisible();
  await expect(sheet.locator('.ps-recipe-step__n > .ps-any')).toHaveClass(/ps-any--off/);

  // Off: nothing of it in Bearbeiten or on the sheet.
  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).uncheck();
  await expect(page.locator('main :is(.any-pen, .any-peek)')).toHaveCount(0);
  await expect(sheet.locator('.ps-sheet--anybook')).toHaveCount(0);
  // On again: the words of its own and the code taken off are where they were.
  await page.getByLabel('Anybook-Codes', { exact: true }).check();
  await expect(zutaten.locator('.word .any-peek')).toHaveText('zwei Eier');
  await expect(step.getByRole('button', { name: 'Code wieder drucken' })).toBeVisible();
  await expect(sheet.locator('.ps-recipe-cards .ps-any').first()).toHaveAttribute('data-said', 'zwei Eier');
  await expect(sheet.locator('.ps-recipe-step__n > .ps-any')).toHaveClass(/ps-any--off/);
});

/*
 * A Lied's line is sung as one, as a Schritt is read: one Anybook circle at
 * its start, none on its pictures, which keep their size — and no place to
 * choose for it.
 */
test('a Lied gives each line one Anybook circle, at its start', async ({ page }) => {
  await pickTemplate(page, /^Lied/);
  await page.getByLabel('Liedtext einfügen').fill('Ich geh mit meiner Laterne\nUnd meine Laterne mit mir');
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  await showSheet(page);

  const sheet = page.locator('.preview-frame');
  const pictures = () => sheet.locator('.ps-song-line .ps-card__img').evaluateAll((all) =>
    all.map((el) => (el as HTMLElement).offsetHeight));
  /* Measured once the sheet has settled: two readings alike. */
  let before = await pictures();
  await expect.poll(async () => { const now = await pictures(); const same = JSON.stringify(now) === JSON.stringify(before); before = now; return same; }).toBe(true);
  expect(before.length).toBeGreaterThan(2);

  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Ecke rechts oben' })).toHaveCount(0);
  const circles = (selector: string) => sheet.locator(selector).evaluateAll((all) =>
    all.map((el) => getComputedStyle(el.querySelector(':scope > .ps-any') ?? el).borderRadius === '50%'));
  await expect.poll(() => circles('.ps-song-line')).toEqual([true, true]);
  expect(await circles('.ps-song-line .ps-card__img')).toEqual(before.map(() => false));
  await expect.poll(pictures).toEqual(before);
  // At the line's start: left of its first picture.
  const [ring, first] = await sheet.locator('.ps-song-line').first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    const scale = box.width / (el as HTMLElement).offsetWidth;
    const after = getComputedStyle(el.querySelector(':scope > .ps-any') ?? el);
    return [box.left + (parseFloat(after.left) + parseFloat(after.width)) * scale, el.querySelector('.ps-card')!.getBoundingClientRect().left];
  });
  expect(ring).toBeLessThanOrEqual(first + 0.5);
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
  const bar = page.getByLabel('Wörter hinzufügen');
  await bar.fill('Apfel');
  await bar.press('Enter');
  await page.getByRole('button', { name: '„Apfel“ ins erste freie Feld legen' }).click();
  await expect(page.locator('.tray .word__name')).toHaveCount(0);
  // A Tafel prints no name until asked; the picture comes and goes with it.
  // One sheet, so it is asked whether, not where.
  await showSheet(page);
  await openDing(page, 'Titel');
  await page.getByLabel('Titel drucken').check();
  await expect(page.getByRole('button', { name: 'Jede Seite', exact: true })).toHaveCount(0);
  await showMaterial(page);
  /* The field as the Symbol menu's line measures it off the sheet. */
  const field = async () => {
    await openDing(page, 'Symbol');
    const text = await page.locator('.ding__mess').innerText();
    await page.keyboard.press('Escape');
    return text;
  };
  const plain = await field();

  // Chosen in the title line under the head, as on every template with one.
  await page.getByRole('button', { name: 'Symbol zum Titel hinzufügen' }).click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.locator('.picker__item', { hasText: 'Banane' }).first().click();
  await closePicker(page);
  await expect(page.getByRole('button', { name: 'Symbol im Titel ändern' }).locator('img')).toBeVisible();
  // No card: neither in the tray nor in the count.
  await expect(page.locator('.tray .word__name')).toHaveCount(0);
  await expect(page.locator('.collection-head')).toContainText('1 Karte');
  // The fields are as wide as before and shorter by the picture.
  const mmOf = (text: string) => text.match(/([\d,]+) × ([\d,]+)/)!.slice(1).map((n) => Number(n.replace(',', '.')));
  await expect.poll(field).not.toBe(plain);
  const [w0, h0] = mmOf(plain);
  const [w1, h1] = mmOf(await field());
  expect(w1).toBe(w0);
  expect(h1).toBeLessThan(h0);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  await expect(sheet.locator('.ps-title .ps-title__pic img')).toBeVisible();
  const background = () => sheet.locator('.ps-page').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background()).toBe('rgb(255, 255, 255)');

  await openDing(page, 'Seite');
  await page.getByLabel('Eigene Farbe: Seitenfarbe').fill('#a9cbec');
  await expect.poll(background).toBe('rgb(169, 203, 236)');
  // The printer's copy too, not only the preview.
  expect(await page.locator('#print-root .ps-sheet').evaluate((el) => el.style.getPropertyValue('--page-bg')))
    .toBe('#a9cbec');

  // And to the paper's edge: its page has no margin of its own, it carries it on the colour.
  const pageRule = () => page.locator('#print-page-setup').textContent();
  await expect.poll(pageRule).toContain('margin: 0;');
  expect(await page.locator('#print-root .ps-page').first().evaluate((el) => el.classList.contains('ps-page--coloured')))
    .toBe(true);

  await openDing(page, 'Seite');
  await page.getByRole('button', { name: 'Seitenfarbe: Kein' }).click();
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
  await expect(page.getByLabel('Liedtext einfügen')).toBeFocused();
  await page.getByLabel('Name des Materials').fill('Laternenlied');
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);
  // Empty, it is one field for the whole song, under the head, and it has
  // the caret; the title line waits until there is a song to head.
  const songBox = page.getByLabel('Liedtext einfügen');
  await expect(page.locator('.title-line')).toHaveCount(0);
  await expect(page.locator('.song__head')).toHaveCount(0);

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
  await expect(songBox).toHaveCount(0);
  // The first Refrain open, the two after it folded: the same rows, not drawn again.
  await expect(page.locator('.song__folded')).toHaveText(Array(2).fill('Refrain · 3 Zeilen · aufklappen'));
  await expect.poll(async () => (await readSentences(page)).length).toBe(6);

  // A line is drawn as a strip is: the line it was typed from over it, to
  // be renamed there, and its symbols under it.
  const rabRows = page.locator(`.row[aria-label="${rab}"]`);
  await expect(rabRows).toHaveCount(4);
  await expect(rabRows.locator('.row__sung')).toHaveText(Array(4).fill('4×'));
  await expect(rabRows.first().locator('.row__title')).toHaveAttribute('placeholder', rab);

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
  await openDing(page, 'Lied');
  await page.getByLabel('Wiederholte Zeilen nur einmal, mit Anzahl (2×, 3× …)').check();
  await expect(sheet.locator('.ps-song-times')).toHaveText(['2×', '2×']);
  await expect(sheet.locator('.ps-song-line')).toHaveCount(13);

  // The Refrain written out where it is first sung, a reference after that.
  await openDing(page, 'Lied');
  await page.getByLabel('Refrain nur einmal ausschreiben, danach „↻ Refrain“').check();
  await expect(sheet.locator('.ps-song-part--refrain')).toHaveCount(1);
  await expect(sheet.locator('.ps-song-again')).toHaveText(['↻Refrain', '↻Refrain']);
  await openDing(page, 'Lied');
  await page.getByLabel('Refrain nur einmal ausschreiben, danach „↻ Refrain“').uncheck();
  await expect(sheet.locator('.ps-song-part--refrain')).toHaveCount(3);

  await openDing(page, 'Lied');
  await page.getByLabel('Überschriften drucken (Strophe, Refrain)').uncheck();
  await expect(sheet.locator('.ps-song-head')).toHaveCount(0);

  // The line as written, above its pictures, as a strip has it: off until
  // asked for, then on, and off again.
  await expect(sheet.locator('.ps-song-part .ps-caption')).toHaveCount(0);
  await openDing(page, 'Lied');
  await page.getByLabel('Satztext drucken').check();
  await expect(sheet.locator('.ps-song-part .ps-caption')).toHaveCount(13);
  await openDing(page, 'Lied');
  await page.getByLabel('Satztext drucken').uncheck();
  await expect(sheet.locator('.ps-song-part .ps-caption')).toHaveCount(0);

  // A song sheet is printed on A5 as often as on A4: the paper is the Lied's to choose.
  await backToPrint(page);
  const pages = await sheet.locator('.ps-page').count();
  await pickPaper(page, 'A5');
  await expect.poll(() => sheet.locator('.ps-page').count()).toBeGreaterThan(pages);
  await showMaterial(page);
});

/**
 * A Lied is changed where it stands, the way the box only ever adds.
 *
 * A part's own line puts a line at its end; „✎ Text" writes one
 * part again, keeping the rows of the lines it keeps; „+ Strophe" is followed
 * by the Refrain as the Strophen before it are; × takes a Refrain out where it
 * is sung there, and „+ Refrain" sings it once more.
 */
test('a Lied grows and shrinks part by part', async ({ page }) => {
  await pickTemplate(page, /^Lied/);
  const refrain = ['Ich geh mit meiner Laterne', 'Hier unten leuchten wir'];
  const rab = 'Rabimmel, rabammel, rabum';
  const songBox = page.getByLabel('Liedtext einfügen');
  await songBox.fill([...refrain, 'Mein Licht geht aus', rab, ...refrain, 'Mein Licht ist klein', rab, ...refrain].join('\n'));
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  const heads = page.locator('.song__head h3');
  await expect(heads).toHaveText(['Refrain', 'Strophe 1', 'Refrain', 'Strophe 2', 'Refrain']);
  await expect.poll(async () => (await readSentences(page)).length).toBe(5);
  const rabId = (await readSentences(page)).find((row) => row.rawInput === rab)!.id;

  // A part's own line, opened by „+ Zeile", adds at its end and is empty again.
  const strophe2 = page.getByRole('region', { name: 'Strophe 2' });
  await strophe2.getByRole('button', { name: '+ Zeile' }).click();
  const line = page.getByLabel('Neue Zeile in Strophe 2');
  await line.fill('Mein Licht ist hell');
  await line.press('Enter');
  await expect(line).toHaveValue('');
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
 * Whether the METACOM notice prints is the material's, in a Lied as anywhere.
 * A Lied keeps its print to itself, and the notice — which the Sammlung does
 * not keep — fell back off on the next change, or would not stay ticked.
 */
test('the copyright notice stays ticked in a Lied while other settings change', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await pickTemplate(page, /^Lied/);
  await page.getByLabel('Liedtext einfügen').fill('Ich geh mit meiner Laterne\nUnd meine Laterne mit mir');
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  await showSheet(page);

  const notice = page.getByLabel('Copyright-Hinweis drucken');
  await openDing(page, 'Seite');
  await notice.check();
  await pickPaper(page, 'Quer');
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('20');
  await openDing(page, 'Seite');
  await expect(notice).toBeChecked();
  await expect(page.locator('.print-view .ps-attribution').first()).toContainText('METACOM Symbole © Annette Kitzinger');

  await page.reload();
  await showSheet(page);
  await openDing(page, 'Seite');
  await expect(page.getByLabel('Copyright-Hinweis drucken')).toBeChecked();
});

/*
 * A part was one block, which a page never breaks inside — so a Strophe taller
 * than a page had nowhere to go: its ground ran past the page's foot and the
 * lines after it were cut off. It goes on over the next page in whole lines,
 * its name over every piece; a part that fits still moves whole.
 */
test('a Strophe too tall for one page goes on over the next, in whole lines', async ({ page }) => {
  await pickTemplate(page, /^Lied/);
  const lines = Array.from({ length: 16 }, (_, at) => `Zeile ${at + 1} vom Garten`);
  await page.getByLabel('Liedtext einfügen').fill(lines.join('\n'));
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  await expect(page.locator('.song__head h3')).toHaveText(['Strophe 1']);
  await showSheet(page);
  await openDing(page, 'Symbol');
  await page.getByLabel('Symbolgröße').fill('30');

  const sheet = page.locator('.preview-frame');
  await expect.poll(() => sheet.locator('.ps-page').count()).toBeGreaterThan(1);
  const seen = await sheet.locator('.ps-sheet').evaluate((one: HTMLElement) =>
    [...one.querySelectorAll<HTMLElement>('.ps-page')].map((pageBox) => {
      const box = pageBox.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(pageBox).paddingBottom) * (box.height / pageBox.offsetHeight);
      const bottom = Math.max(...[...pageBox.querySelectorAll('.ps-song-part')].map((part) => part.getBoundingClientRect().bottom));
      return Math.round(bottom - (box.bottom - pad));
    }));
  for (const over of seen) expect(over).toBeLessThanOrEqual(1);
  // Every line on paper once, the Strophe named over each of its pieces.
  await expect(sheet.locator('.ps-song-line')).toHaveCount(16);
  const heads = await sheet.locator('.ps-song-head').allTextContents();
  expect(heads.length).toBeGreaterThan(1);
  expect(heads[0]).toBe('Strophe 1');
  for (const head of heads.slice(1)) expect(head).toMatch(/^Strophe 1/);
  // The first piece takes what is left under the title, not a page of its own.
  await expect(sheet.locator('.ps-page').first().locator('.ps-song-part')).toHaveCount(1);
});

/** Adds a card through a „+" in `scope`, picking `term` in the symbol search. */
async function pickCard(page: import('@playwright/test').Page, scope: import('@playwright/test').Locator, label: string, term: string): Promise<void> {
  await scope.getByRole('button', { name: label }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByLabel('Symbol suchen');
  await search.fill(term);
  await search.press('Enter');
  await page.locator('.picker__item', { hasText: term }).first().click();
  await closePicker(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * A Plauderbuch is written page by page, as the Plauderplan-Drehbuch is laid
 * out: a question on each page, the Antworten to choose from under it.
 *
 * Held here: the question is a title's line — its symbols, a „+" for one
 * more, its words written where they stand, the caret in them on an empty
 * book; its first words bring a picture, words written again keep the
 * symbols. An Antwort is a card added by the wall's „+"; there is no „✎
 * Text". On paper each page is a sheet with its question on the band, a
 * free field, and every field the page holds, however many Antworten it
 * has — six on A5 standing, square, upright with the word, nine on A4
 * standing; more Antworten wait under the page, as cards beside a Tafel
 * do, are not printed, come onto the page on a paper that holds them, and
 * a waiting card
 * dropped on one on the page changes places with it; the cards follow on
 * sheets of their own, cut lines on, the laminate's seam smaller than a
 * field, which carry no footer and are not counted in the page numbers; the
 * paper opens A5 standing.
 */
test('a Plauderbuch is written page by page, and prints its pages and the cards to cut', async ({ page }) => {
  await pickTemplate(page, /^Plauderbuch/);
  await expect(page.getByLabel('Satz eingeben')).toHaveCount(0);
  await expect(page.getByText('Jede Seite ist eine Frage mit Antworten zum Kletten.')).toBeVisible();
  await expect(page.locator('.empty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Andere Vorlage wählen' })).toBeVisible();

  // The first page's question is a title's line, the caret in its words; its
  // „+" opens the symbol search — closed without one, nothing is left.
  const ask = page.getByLabel('Frage für „Seite 1“');
  await expect(ask).toBeFocused();
  await expect(ask).toHaveClass(/title-line__text/);
  await page.getByRole('button', { name: 'Symbol zur Frage von „Seite 1“ hinzufügen' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await readSentences(page)).length).toBe(0);
  await ask.fill('Was ich erzählen will');
  await ask.press('Enter');
  const first = page.getByRole('region', { name: 'Was ich erzählen will' });
  await expect(first.getByLabel('Frage für „Was ich erzählen will“')).toHaveValue('Was ich erzählen will');
  await expect(first.locator('.title-line__pic')).toHaveCount(1);
  await expect(page.getByText('Jede Seite ist eine Frage mit Antworten zum Kletten.')).toHaveCount(0);

  // Written again, the words change and the symbol stays; the „+" adds one.
  const question = await readSentences(page).then((rows) => rows[0]!);
  await first.getByLabel('Frage für „Was ich erzählen will“').fill('Was ich erzähle');
  await first.getByLabel('Frage für „Was ich erzählen will“').press('Enter');
  const asked = page.getByRole('region', { name: 'Was ich erzähle' });
  await expect(asked.locator('.title-line__pic')).toHaveCount(1);
  await pickCard(page, asked, 'Symbol zur Frage von „Was ich erzähle“ hinzufügen', 'Sonne');
  await expect(asked.locator('.title-line__pic')).toHaveCount(2);
  const rows = await readSentences(page);
  expect(rows.find((row) => row.id === question.id)?.rawInput).toBe('Was ich erzähle');

  // Antworten by the wall's „+", one at a time; no „✎ Text".
  await expect(page.getByRole('button', { name: /als Text bearbeiten/ })).toHaveCount(0);
  const words = ['Apfel', 'Ball', 'Hund', 'Katze', 'Maus', 'Baum', 'Haus', 'Auto', 'Kuchen'];
  for (const word of words) await pickCard(page, asked, 'Antwort zu „Was ich erzähle“ hinzufügen', word);

  // Six fit on A5 standing; the rest wait under it, with the „+".
  await expect(asked.locator('.talk__sayings .word__name')).toHaveText(words.slice(0, 6));
  const tray = asked.locator('.talk__tray');
  await expect(tray.locator('.tray__head b')).toHaveText('Passt nicht mehr auf die Seite');
  await expect(tray.locator('.word__name')).toHaveText(words.slice(6));
  await expect(asked.locator('.talk__sayings .word--add')).toHaveCount(0);
  await expect(tray.locator('.word--add')).toHaveCount(1);
  // Dropped on a card on the page, the waiting one takes its place.
  await tray.locator('.board-card').first().dragTo(asked.locator('.talk__sayings .board-card').nth(5));
  await expect(asked.locator('.talk__sayings .word__name').nth(5)).toHaveText('Haus');
  await expect(tray.locator('.word__name').first()).toHaveText('Baum');

  // A new page, named by its place while it has no question.
  await page.getByRole('button', { name: '+ Seite' }).click();
  const second = page.getByRole('region', { name: 'Seite 2' });
  await pickCard(page, second, 'Antwort zu „Seite 2“ hinzufügen', 'Stern');
  await expect(second.locator('.word__name')).toHaveText(['Stern']);

  await showSheet(page);
  const sheet = page.locator('.preview-frame');
  // A5 standing goes two pages side by side on an A4 lying down: the printer takes nothing else.
  await expect.poll(() => page.evaluate(() => document.getElementById('print-page-setup')?.textContent ?? ''))
    .toContain('size: 297mm 210mm');
  await expect(sheet.locator('.ps-paper--two.ps-paper--side .ps-talk')).toHaveCount(2);
  await expect(sheet.locator('.ps-paper--two .ps-fold')).toHaveCount(2);
  // The cards on a whole A4 of their own, and the head counts sheets of paper.
  await expect(sheet.locator('.ps-page--whole .ps-talk-cut')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Papier wählen' })).toHaveText('A5 hoch · 2 pro A4 · 2 Blatt');
  // One sheet a page, its question's symbols and words on the band, all
  // six square fields on every page — what waits is not printed.
  const pages = sheet.locator('.ps-talk');
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(0).locator('.ps-talk__question')).toHaveText('Was ich erzähle');
  await expect(pages.nth(0).locator('.ps-talk__band .ps-title__pic')).toHaveCount(2);
  await expect(sheet.locator('.ps-talk__field--free')).toHaveCount(2);
  expect(await pages.evaluateAll((all) => all.map((one) =>
    one.querySelectorAll('.ps-talk__fields .ps-talk__field').length))).toEqual([6, 6]);
  const mm = (where: string, name: string) => sheet.locator(where).first().evaluate((node, prop) =>
    parseFloat(getComputedStyle(node).getPropertyValue(prop)), name);
  await expect.poll(async () => await mm('.ps-talk', '--talk-w') - await mm('.ps-talk', '--talk-h')).toBeCloseTo(0, 2);
  // The cards to cut: square, no word, the laminate's 2 mm a side smaller, cut lines on.
  const cut = sheet.locator('.ps-talk-cut');
  await expect(cut.locator('.ps-talk__card')).toHaveCount(7);
  await expect(cut.locator('.ps-talk__word')).toHaveCount(0);
  await expect.poll(async () => await mm('.ps-talk', '--talk-w') - await mm('.ps-talk-cut', '--talk-w')).toBeCloseTo(4, 2);
  await expect(sheet.locator('.ps-sheet')).toHaveClass(/ps-sheet--cutlines/);

  // With the word the cards stand upright, as many as before.
  await openDing(page, 'Symbol');
  await page.getByLabel('Beschriftung drucken').check();
  await expect.poll(async () => await mm('.ps-talk', '--talk-w') / await mm('.ps-talk', '--talk-h')).toBeCloseTo(0.75, 2);
  await expect(tray.locator('.word__name')).toHaveCount(3);
  await expect(cut.locator('.ps-talk__word')).toHaveText([...words.slice(0, 5), 'Haus', 'Stern']);
  // A4 standing holds nine: what waited comes onto the page by itself,
  // and only the „+" is left under it.
  await pickPaper(page, 'A4');
  await expect(tray.locator('.word__name')).toHaveCount(0);
  await expect(asked.locator('.talk__sayings .word__name')).toHaveCount(9);
  expect(await pages.evaluateAll((all) => all.map((one) =>
    one.querySelectorAll('.ps-talk__fields .ps-talk__field').length))).toEqual([9, 9]);
  await expect(cut.locator('.ps-talk__word')).toHaveText([...words.slice(0, 5), 'Haus', 'Baum', 'Auto', 'Kuchen', 'Stern']);

  // Its own colours: the band and the free field's line.
  await openDing(page, 'Plauderbuch');
  await page.getByRole('button', { name: 'Band Grün', exact: true }).click();
  await expect.poll(() => sheet.locator('.ps-talk__band').first().evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe('rgb(216, 242, 210)');

  // With Anybook only the cards carry a code: the question none, on paper
  // or in Bearbeiten, so its words keep their room on the band.
  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).check();
  await expect(cut.locator('.ps-any')).not.toHaveCount(0);
  await expect(sheet.locator('.ps-talk__band .ps-any')).toHaveCount(0);
  await expect(asked.locator('.talk__sayings .any-mark')).not.toHaveCount(0);
  await expect(asked.locator('.talk__head .any-mark')).toHaveCount(0);
  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).uncheck();

  // The footer as everywhere — on the book's pages only.
  await openDing(page, 'Seite');
  await page.getByLabel('Seitenzahlen drucken').check();
  await expect(sheet.locator('.ps-page__n')).toHaveText(['Seite 1 von 2', 'Seite 2 von 2']);
  expect(await sheet.locator('.ps-page').evaluateAll((all) => all
    .filter((one) => one.querySelector('.ps-talk-cut'))
    .map((one) => one.querySelector('.ps-foot') === null))).not.toContain(false);

  // A page taken out goes with its cards.
  await showMaterial(page);
  await expect.poll(async () => (await readSentences(page)).length).toBe(11);
  await second.getByRole('button', { name: '„Seite 2“ löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.locator('.talk__page')).toHaveCount(1);
  await expect.poll(async () => (await readSentences(page)).length).toBe(10);
});

/*
 * Wortkarten are typed as a list: a comma, a semicolon or a new line makes
 * the next card, a space does not. The box says what Enter will make before
 * it is pressed, stands on top of the page in „Bearbeiten" and nowhere in
 * „Drucken"; the head follows it, and the title heads the material's panel.
 */
test('Wortkarten take a list, and say which cards it makes before Enter', async ({ page }) => {
  await pickTemplate(page, /^Wortkarten/);
  const box = page.getByLabel('Wörter hinzufügen');
  await box.fill('Apfel, Guten Morgen; 1,5 l Milch');
  await expect(page.locator('.composer__chip')).toHaveText(['Apfel', 'Guten Morgen', '1,5 l Milch']);
  await expect(page.locator('.composer__count')).toHaveText('3 Karten');
  await box.press('Enter');
  await expect(page.locator('.words .word:not(.word--add) .word__name'))
    .toHaveText(['Apfel', 'Guten Morgen', '1,5 l Milch'], { useInnerText: true });

  // Wortkarten start without their title; the title line stands only while it prints.
  await openDing(page, 'Titel');
  await page.getByLabel('Titel drucken').check();

  // Box, head, title, wall — in that order, once there is something to head.
  const top = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
  expect(await top('.composer')).toBeLessThan(await top('.collection-head'));
  expect(await top('.collection-head')).toBeLessThan(await top('.title-line'));
  expect(await top('.title-line')).toBeLessThan(await top('.words'));

  await showSheet(page);
  await expect(page.locator('.print-dock').getByLabel('Wörter hinzufügen')).toHaveCount(0);
  await expect(page.locator('.print-dock .title-line')).toHaveCount(0);
});

/* An Einkaufsliste is typed as Wortkarten are: the box on top, a list. */
test('an Einkaufsliste takes a list in the box on top, its title over the cards', async ({ page }) => {
  await pickTemplate(page, /^Einkaufsliste/);
  const box = page.getByLabel('Wörter hinzufügen');
  await box.fill('Milch, Brot, Äpfel');
  await expect(page.locator('.composer__count')).toHaveText('3 Karten');
  await box.press('Enter');
  await expect(page.locator('.words .word:not(.word--add)')).toHaveCount(3);
  const top = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
  expect(await top('.composer')).toBeLessThan(await top('.collection-head'));
  expect(await top('.collection-head')).toBeLessThan(await top('.title-line'));
  await showSheet(page);
  await expect(page.locator('.print-dock').getByLabel('Wörter hinzufügen')).toHaveCount(0);
});

/*
 * A Tafel is typed into where the card goes: a free field pressed is a line
 * to type in, and the word lies in that field — a list in the next free
 * fields from there. The box under the head, as everywhere, puts its cards
 * into the tray, to be placed by hand.
 */
test('a word typed into a free field lies there, a list in the next free fields', async ({ page }) => {
  await pickTemplate(page, /^Tafel/);
  // Empty, a Tafel is its box and its grid; its title line comes with its first card.
  await expect(page.locator('.title-line')).toHaveCount(0);
  const top = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
  expect(await top('.composer')).toBeLessThan(await top('.board-head'));

  await page.getByRole('button', { name: 'Neue Karte in Feld 2' }).click();
  const line = page.getByLabel('Wort für Feld 2');
  await line.fill('Apfel, Banane');
  await line.press('Enter');
  const cells = page.locator('.board .cell');
  await expect(cells.nth(1).locator('.word__name')).toHaveText('Apfel');
  await expect(cells.nth(2).locator('.word__name')).toHaveText('Banane');
  await expect(cells.nth(0)).toHaveClass(/cell--free/);
  // A Tafel starts without its title; the title line stands only while it prints.
  await openDing(page, 'Titel');
  await expect(page.getByLabel('Titel drucken')).toBeChecked();
  expect(await top('.title-line')).toBeLessThan(await top('.board'));
  expect(await top('.board')).toBeLessThan(await top('.board-head'));

  const box = page.getByLabel('Wörter hinzufügen');
  await box.fill('Kiwi');
  await box.press('Enter');
  await expect(page.locator('.tray .word__name')).toHaveText(['Kiwi']);
});

test('a card that grows round its symbol grows upwards or sideways for the Anybook placeholder and keeps its symbol, and gives a little up for überlappend', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await showSheet(page);
  const sizes = () => page.evaluate(() => {
    const mm = 96 / 25.4;
    const card = document.querySelector('.preview-frame .ps-card:has(img)') as HTMLElement;
    const scale = card.getBoundingClientRect().width / card.offsetWidth;
    const box = card.querySelector('.ps-card__img') as HTMLElement;
    const code = box.querySelector(':scope > .ps-any') as HTMLElement | null;
    const after = code ? getComputedStyle(code) : null;
    const pic = (box.querySelector('img') as HTMLElement).getBoundingClientRect();
    const at = box.getBoundingClientRect();
    return {
      width: card.offsetWidth / mm,
      height: card.offsetHeight / mm,
      symbol: box.clientWidth / mm,
      circle: after !== null && after.display !== 'none',
      // The picture below the circle (at the box's top, 9.5 mm tall): none of it under the sticker.
      below: (pic.top - (at.top + scale * ((parseFloat(after?.top ?? '0') || 0) + 9.5 * mm))) / scale / mm,
      // And in the card's middle.
      off: ((pic.left + pic.right) / 2 - (card.getBoundingClientRect().left + card.getBoundingClientRect().right) / 2) / scale / mm,
      // The circle's middle against the box's, in mm.
      circleOff: ((parseFloat(after?.left ?? '0') || 0) + 4.75 * mm - box.offsetWidth / 2) / mm,
    };
  });
  const before = await sizes();
  expect(before.circle).toBe(false);

  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).check();
  await expect.poll(async () => (await sizes()).circle).toBe(true);
  const after = await sizes();
  expect(after.symbol).toBeCloseTo(before.symbol, 1);
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeGreaterThan(before.height + 8);
  expect(after.below).toBeGreaterThanOrEqual(-0.05);
  expect(Math.abs(after.off)).toBeLessThan(0.3);
  // Darüber means over the symbol's middle.
  expect(Math.abs(after.circleOff)).toBeLessThan(0.3);

  /* Daneben and überlappend: the circle against the picture, and the card. */
  const against = () => page.evaluate(() => {
    const mm = 96 / 25.4;
    const card = document.querySelector('.preview-frame .ps-card:has(img)') as HTMLElement;
    const scale = card.getBoundingClientRect().width / card.offsetWidth;
    const box = card.querySelector('.ps-card__img') as HTMLElement;
    // Darüber and daneben hang the circle on the symbol's box, überlappend on the card.
    const host = getComputedStyle(box.querySelector(':scope > .ps-any') ?? box).borderRadius === '50%' ? box : card;
    const ring = getComputedStyle(host.querySelector(':scope > .ps-any') ?? host);
    const at = box.getBoundingClientRect();
    const hostAt = host.getBoundingClientRect();
    // The mocked symbol is 1 px: asked to be big, it takes what room the box leaves it, as a real one does.
    const img = box.querySelector('img') as HTMLElement;
    img.style.width = img.style.height = '1000px';
    const pic = img.getBoundingClientRect();
    img.style.width = img.style.height = '';
    const left = hostAt.left / scale + host.clientLeft + parseFloat(ring.left);
    const top = hostAt.top / scale + host.clientTop + parseFloat(ring.top);
    const edge = card.getBoundingClientRect();
    return {
      // The circle from the card's corner, inside its edge, in mm.
      fromRight: (edge.right / scale - card.clientLeft - (left + parseFloat(ring.width))) / mm,
      fromTop: (top - edge.top / scale - card.clientTop) / mm,
      // The picture's bottom line against its box's, in mm.
      bottom: (at.bottom - pic.bottom) / scale / mm,
      width: card.offsetWidth / mm,
      height: card.offsetHeight / mm,
      symbol: Math.min(pic.width, pic.height) / scale / mm,
      // How far the circle stays off the picture, to its right and above it, in mm: below 0, it lies on it.
      right: (left - pic.right / scale) / mm,
      above: (pic.top / scale - (top + parseFloat(ring.height))) / mm,
    };
  });

  // Daneben: the card grows to the right by the circle, the symbol keeps its size, the circle is off it.
  await page.getByRole('radio', { name: 'rechts', exact: true }).click();
  await expect.poll(async () => (await against()).width).toBeGreaterThan(before.width + 10);
  const beside = await against();
  expect(beside.symbol).toBeCloseTo(before.symbol, 0);
  expect(beside.height).toBeCloseTo(before.height, 1);
  expect(beside.right).toBeGreaterThanOrEqual(-0.05);

  // Überlappend: 1.4 mm inside the card's 0.2 mm cut line, 1.5 mm from its middle, the card as it was; the
  // symbol gives up only what it must, on its bottom line, so the circle lies
  // on the picture's corner by no more than its diameter, width and height
  // together — over the whole box (391f546) it hid most of the picture.
  await page.getByRole('radio', { name: 'Ecke rechts oben' }).click();
  await expect.poll(async () => (await against()).width).toBeCloseTo(before.width, 1);
  const over = await against();
  expect(over.height).toBeCloseTo(before.height, 1);
  expect(Math.abs(over.fromRight - 1.4)).toBeLessThan(0.25);
  expect(Math.abs(over.fromTop - 1.4)).toBeLessThan(0.25);
  expect(over.symbol).toBeLessThan(before.symbol - 1);
  expect(Math.abs(over.bottom)).toBeLessThan(0.2);
  expect(-Math.min(0, over.right) - Math.min(0, over.above)).toBeLessThan(9.6);
});

test('with a narrow Rand the Anybook circle still keeps 2.5 mm from the cut line above, below, left and right, and 1.5 mm in a corner', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await showSheet(page);
  await openDing(page, 'Symbol');
  await page.getByLabel('Rand', { exact: true }).fill('1');
  await openDing(page, 'Anybook');
  await page.getByLabel('Anybook-Codes', { exact: true }).check();
  // The circle against the card's edge, in mm: the nearest of its four sides.
  const gap = () => page.evaluate(() => {
    const ring = document.querySelector('.preview-frame .ps-card:has(img) .ps-any') as HTMLElement;
    const card = ring.closest('.ps-card') as HTMLElement;
    const r = ring.getBoundingClientRect();
    const q = card.getBoundingClientRect();
    const mm = r.width / 9.5;
    return Math.min(r.left - q.left, r.top - q.top, q.right - r.right, q.bottom - r.bottom) / mm;
  });
  for (const place of ['oben', 'unten', 'links', 'rechts']) {
    await page.getByRole('radio', { name: place, exact: true }).click();
    // 2.5 mm, give or take the screen's rounding of the 0.2 mm cut line.
    await expect.poll(gap, { message: place }).toBeGreaterThan(2.35);
  }
  await page.getByRole('radio', { name: 'Ecke rechts oben' }).click();
  await expect.poll(gap).toBeGreaterThan(1.35);
});

