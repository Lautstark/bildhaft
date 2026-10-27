import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { addCards, openDing, pickTemplate, showSheet, translate } from './helpers.ts';

/**
 * „Alle drucken": one print over a template group, from the printer button on
 * the group's head in the sidebar.
 *
 * Held here: every material of the group is ticked and prints exactly its own
 * pages — a single ticked material is the single print; the Kartenbögen of
 * materials whose cards print identically are shared, condensed at the end;
 * cards that would print differently (here: with against without
 * Beschriftung) keep a Bogen of their own; a tick taken away takes the
 * material's pages and its cards with it, at once.
 */
test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

/** Adds a cell through a „+" tile, picking `term` in the symbol dialog. */
async function pick(page: Page, label: string, term: string): Promise<void> {
  await page.locator('.game__row').last().getByRole('button', { name: label }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByLabel('Symbol suchen');
  await search.fill(term);
  await search.press('Enter');
  await page.locator('.picker__item', { hasText: term }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The width of the first cut card under `scope`, in millimetres of paper. */
async function cutWidth(page: Page, scope: string): Promise<number> {
  return page.evaluate((selector) => {
    const cut = document.querySelector(`${selector} .ps-spiel-cut`) as HTMLElement | null;
    return cut ? parseFloat(getComputedStyle(cut).getPropertyValue('--talk-w')) : 0;
  }, scope);
}

/** A new Material of the given template, named. */
async function newMaterial(page: Page, template: RegExp, name: string): Promise<void> {
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, template);
  await page.getByLabel('Name des Materials').fill(name);
}

/** One Spiel of one row: a printed picture and a Platzhalter. */
async function newGame(page: Page, name: string, bild: string, karte: string): Promise<void> {
  await newMaterial(page, /^Spiel/, name);
  await pick(page, '+ Bild', bild);
  await pick(page, '+ Platzhalter', karte);
  /* With its words, so the cards can be told apart on the shared Bogen. */
  await openDing(page, 'Symbol');
  await page.getByLabel('Beschriftung drucken').check();
  await page.keyboard.press('Escape');
}

test('der Gruppendruck druckt die Spiele zusammen, die Karten geteilt auf einem Bogen', async ({ page }) => {
  // Six materials, so the sidebar groups by template and the groups have heads.
  await translate(page, 'Ich möchte einen Apfel essen');
  for (const name of ['K1', 'K2', 'K3']) {
    await newMaterial(page, /^Wortkarten/, name);
    await addCards(page, ['Banane']);
  }
  await newGame(page, 'Spiel A', 'Schuh', 'Socke');
  await newGame(page, 'Spiel B', 'Regen', 'Banane');

  // The cut card as Spiel B's single print cuts it — the measure the shared
  // Bogen must keep, however many games' rows stand behind it.
  await showSheet(page);
  const single = await cutWidth(page, '.print-view .preview-frame');
  expect(single).toBeGreaterThan(20);

  // The printer on the group's head opens the overlay: every Spiel ticked,
  // one board per Spiel — the group in the sidebar's order, latest first —
  // and one shared Bogen holding both games' cards.
  await page.getByRole('button', { name: 'Alle Spiele drucken' }).click();
  const overlay = page.locator('.group-print');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('checkbox')).toHaveCount(2);
  await expect(overlay.locator('.ps-spiel')).toHaveCount(2);
  await expect(overlay.locator('.ps-spiel-cut')).toHaveCount(1);
  await expect(overlay.locator('.ps-spiel-cut .ps-talk__card .ps-spiel__wort')).toHaveText(['Banane', 'Socke']);
  await expect(overlay.locator('.print-view__caprow')).toContainText('3 Seiten');
  // The shared Bogen cuts the very card the single print cuts.
  expect(await cutWidth(page, '.group-print')).toBeCloseTo(single, 1);
  // Each board is exactly its single print's board: its cells, its Ablage.
  const first = overlay.locator('.preview-frame').first();
  await expect(first.locator('.ps-spiel__bild .ps-spiel__wort')).toHaveText(['Regen']);
  await expect(first.locator('.ps-talk__field--free')).toHaveCount(1);
  await expect(first.locator('.ps-spiel__lager .ps-talk__field')).toHaveCount(1);

  // A tick taken away takes the material's board and its cards with it.
  await overlay.locator('.group-print__check', { hasText: 'Spiel B' }).getByRole('checkbox').uncheck();
  await expect(overlay.locator('.ps-spiel')).toHaveCount(1);
  await expect(overlay.locator('.ps-spiel-cut .ps-talk__card .ps-spiel__wort')).toHaveText(['Socke']);
  await expect(overlay.locator('.print-view__caprow')).toContainText('2 Seiten');
  // One ticked material is the single print: board sheet, then its Bogen.
  await expect(overlay.getByRole('button', { name: 'Drucken' })).toBeEnabled();
  await page.getByRole('button', { name: 'Große Vorschau schließen' }).click();
  await expect(overlay).toHaveCount(0);

  // Cards that would print differently share no Bogen: Spiel B loses its
  // Beschriftung, and the group keeps two Bögen — each as its game prints.
  await openDing(page, 'Symbol');
  await page.getByLabel('Beschriftung drucken').uncheck();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Alle Spiele drucken' }).click();
  await expect(overlay.locator('.ps-spiel-cut')).toHaveCount(2);
  await expect(overlay.locator('.print-view__caprow')).toContainText('4 Seiten');
  // Spiel B's card wordless on a Bogen of its own, Spiel A's worded on another.
  await expect(overlay.locator('.ps-spiel-cut .ps-talk__card').nth(0).locator('.ps-spiel__wort')).toHaveCount(0);
  await expect(overlay.locator('.ps-spiel-cut .ps-talk__card').nth(1).locator('.ps-spiel__wort')).toHaveText('Socke');
});
