import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { openDing, pickTemplate, showSheet } from './helpers.ts';

/**
 * The Messzeile: the Symbol menu's first line, in every template, says how big
 * the symbol, the card and the word come out of the printer — measured off
 * the sheet beside it, whoever set the size. Satzstreifen, Wortkarten, Tafel
 * and Spiel hold it to the millimetre in their own specs; here the templates
 * that had no line of their own, or one somewhere else, are held to having it.
 */
test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
});

async function newMaterial(page: Page, template: RegExp): Promise<void> {
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, template);
}

async function pickCard(page: Page, label: string, term: string): Promise<void> {
  await page.getByRole('button', { name: label }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const search = page.getByLabel('Symbol suchen');
  await search.fill(term);
  await search.press('Enter');
  await page.locator('.picker__item', { hasText: term }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The line, read with the Symbol menu open. */
async function line(page: Page): Promise<string> {
  await showSheet(page);
  await openDing(page, 'Symbol');
  const mess = page.locator('.ding__mess');
  await expect(mess).toBeVisible();
  return mess.innerText();
}

const sized = /Symbol \d+ mm[\s\S]*Karte \d+ × \d+ mm/;

test('die Einkaufsliste sagt im Symbol-Menü, wie groß gedruckt wird', async ({ page }) => {
  await newMaterial(page, /^Einkaufsliste/);
  await page.getByLabel('Wörter hinzufügen').fill('Apfel');
  await page.getByLabel('Wörter hinzufügen').press('Enter');
  await expect(page.locator('.word__name')).toHaveText(['Apfel']);
  expect(await line(page)).toMatch(sized);
});

test('das Lied sagt im Symbol-Menü, wie groß gedruckt wird', async ({ page }) => {
  await newMaterial(page, /^Lied/);
  await page.getByLabel('Liedtext einfügen').fill('Ich geh mit meiner Laterne');
  await page.getByRole('button', { name: 'Übersetzen' }).click();
  await expect(page.getByLabel('Liedtext einfügen')).toHaveCount(0);
  expect(await line(page)).toMatch(sized);
});

test('das Rezept sagt im Symbol-Menü, wie groß gedruckt wird', async ({ page }) => {
  await newMaterial(page, /^Rezept/);
  await pickCard(page, 'Zutat hinzufügen', 'Eier');
  expect(await line(page)).toMatch(sized);
});

test('das Plauderbuch sagt im Symbol-Menü, wie groß gedruckt wird', async ({ page }) => {
  await newMaterial(page, /^Plauderbuch/);
  await pickCard(page, 'Antwort zu „Seite 1“ hinzufügen', 'Sonne');
  expect(await line(page)).toMatch(sized);
});
