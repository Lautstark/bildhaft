import { expect, type Page } from '@playwright/test';

/**
 * Submits one sentence and waits for its row.
 *
 * The wait is required, not cosmetic: submission is disabled while a translation
 * is in flight, so firing Enter twice in quick succession silently drops the
 * second sentence.
 */
export async function translate(page: Page, sentence: string): Promise<void> {
  const rows = page.locator('.row');
  const before = await rows.count();
  const input = page.getByLabel('Satz eingeben');
  await input.fill(sentence);
  await input.press('Enter');
  await expect(rows).toHaveCount(before + 1);
}

export async function translateAll(page: Page, sentences: string[]): Promise<void> {
  for (const sentence of sentences) await translate(page, sentence);
}

/**
 * The row a given line was typed into.
 *
 * Not `hasText`: the head of a row is the field that names it, so the line it
 * was made from is that field's placeholder rather than text on the page. One
 * helper rather than the same filter written out at each call site, because
 * this is exactly the detail that should only have to be learned once.
 */
export function rowFor(page: Page, typed: string) {
  return page.locator('.row')
    .filter({ has: page.locator(`.row__title[placeholder="${typed}"]`) });
}

/**
 * The open Sammlung's sheet: „Drucken" in its head opens it as an overlay
 * over the material, and the wait is for the preview to be laid out.
 */
export async function showSheet(page: Page): Promise<void> {
  if (!(await page.locator('.print-overlay').isVisible().catch(() => false))) {
    await page.locator('.collection-head').getByRole('button', { name: 'Drucken', exact: true }).click();
  }
  await expect(page.locator('.print-view .preview-frame .ps-sheet')).toBeVisible();
}

/** Back to the Sammlung's material: the overlay's ×. */
export async function showMaterial(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Drucken schließen' }).click();
  await expect(page.locator('.print-overlay')).toHaveCount(0);
}

/** Older names for the same wait, from when the settings were split over two dialogs. */
export const openLook = showSheet;
export const backToPrint = showSheet;

/**
 * Gives the open, empty Material its template.
 *
 * A Material made by „+ Neues Material" asks first; the one the page makes on
 * its own on the first day starts as Satzstreifen and is asked through
 * „Andere Vorlage wählen". Either way the choice is gone once it is made.
 */
export async function pickTemplate(page: Page, name: RegExp): Promise<void> {
  const tiles = page.locator('.templates');
  const other = page.getByRole('button', { name: 'Andere Vorlage wählen' });
  await expect(tiles.or(other).first()).toBeVisible();
  if (await other.isVisible()) await other.click();
  await tiles.getByRole('button', { name }).click();
  await expect(tiles).toHaveCount(0);
}

/**
 * Turns the open, empty Material into Wortkarten and types one card per word.
 * A card sheet is the Wortkarten's alone: a Satzstreifen prints as strips.
 */
export async function addCards(page: Page, words: string[]): Promise<void> {
  await pickTemplate(page, /^Wortkarten/);
  const cards = page.locator('.words .word:not(.word--add)');
  for (const word of words) {
    const before = await cards.count();
    const input = page.getByLabel('Wörter hinzufügen');
    await input.fill(word);
    await input.press('Enter');
    await expect(cards).toHaveCount(before + 1);
  }
}

/** The five words of „Ich möchte einen Apfel essen" and „Ich möchte schlafen" a card sheet keeps. */
export const FIVE_WORDS = ['Ich', 'möchte', 'Apfel', 'essen', 'schlafen'];

/** A second Sammlung of Wortkarten, its sheet showing. */
export async function cardSheet(page: Page, words: string[] = FIVE_WORDS): Promise<void> {
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.getByRole('button', { name: '+ Neues Material' }).click();
  await expect(page.locator('.templates')).toBeVisible();
  await pickTemplate(page, /^Wortkarten/);
  await page.getByLabel('Name des Materials').fill('Karten');
  await addCards(page, words);
  await showSheet(page);
}

/**
 * Waits until some Sammlung has written a print setting down. The sheet shows
 * a change before it is kept, so a reload straight after a click can come
 * first and find the old value.
 */
export async function untilKept(page: Page, key: string, value: unknown): Promise<void> {
  await expect.poll(() => page.evaluate(async ([k, v]) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bildhaft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows: { print?: Record<string, unknown> }[] = await new Promise((resolve) => {
      const req = db.transaction('collections').objectStore('collections').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return rows.some((row) => row.print?.[k as string] === v);
  }, [key, value] as const)).toBe(true);
}
