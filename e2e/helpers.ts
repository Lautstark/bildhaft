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
  /* Folded, the whole rail is the way back open (the peek overlay). */
  const peek = page.locator('.print-dock__peek');
  if (await peek.isVisible().catch(() => false)) await peek.click();
  await expect(page.locator('.print-view .preview-frame .ps-sheet')).toBeVisible();
}

/**
 * The material was a view to go back to once; now it is always on screen
 * beside the sheet. Kept as a no-op so the specs read as the flow they test.
 */
export async function showMaterial(_page: Page): Promise<void> {
  /* nothing to do: the sheet no longer covers the material */
}

/** Older names for the same wait, from when the settings were split over two dialogs. */
export const openLook = showSheet;
export const backToPrint = showSheet;

/**
 * Opens one thing-menu of the Zeile over the material — Seite, Titel or
 * Symbol — closing the print overlay first when it is up. The Zeile is where
 * a moved template's settings live; the sheet only shows them.
 */
export async function openDing(page: Page, name: 'Seite' | 'Symbol' | 'Streifen' | 'Lied' | 'Tafel' | 'Spiel' | 'Plauderbuch'): Promise<void> {
  const chip = page.locator(`.ding__chip[aria-label="${name}"]`);
  if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click();
}

/** Picks the paper — the pill in the panel's head that names it. */
export async function pickPaper(page: Page, name: string): Promise<void> {
  const pop = page.locator('.paper-pick__pop');
  if (!(await pop.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Papier wählen' }).click();
  }
  await pop.getByRole('button', { name, exact: true }).click();
  /* Put the pop away: left open it lies over the Zeile's chips, and the next
     click would land on it instead. A person sees that; a spec must not. */
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
}

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

/** The Symbol dialog keeps its search folded under the picture while one is chosen (her pick „Karte“): opens it. */
export async function openSymbolSearch(page: Page): Promise<void> {
  const tile = page.locator('dialog.sheet .picker__tile');
  if (await tile.getAttribute('aria-expanded') !== 'true') await tile.click();
}
