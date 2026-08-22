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
