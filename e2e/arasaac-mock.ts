import type { Page, Route } from '@playwright/test';

/**
 * ARASAAC is mocked for two reasons: the suite must be deterministic enough to
 * gate a deployment, and it should not hammer a free public service on every
 * push. The shapes mirror the real API closely enough that the ranking and
 * caching code under test behaves the same.
 */

/** A 1x1 transparent PNG — enough for naturalWidth > 0. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Stable id per search term, so assertions can predict what was chosen. */
export function idForTerm(term: string): number {
  let hash = 0;
  for (const char of term.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % 90_000;
  return 1000 + hash;
}

/**
 * Labels the mock returns, in the order the ranker should produce them.
 * Capitalised because the provider lowercases its query before requesting, while
 * the real API is case-insensitive and answers with properly cased German words.
 */
export function labelsForTerm(term: string): string[] {
  const word = term.charAt(0).toUpperCase() + term.slice(1);
  return [word, `${word}chen`, `${word}haus`];
}

export interface MockOptions {
  /**
   * Substrings that should return no results. Matched as substrings because the
   * pipeline tries several lemma variants of a word before giving up, and every
   * one of them has to miss for a token to count as unmatched.
   */
  emptyFor?: string[];
  /** Make every image request fail, for exercising the error state. */
  failImages?: boolean;
}

export async function mockArasaac(page: Page, options: MockOptions = {}): Promise<void> {
  const empty = new Set((options.emptyFor ?? []).map((t) => t.toLowerCase()));

  await page.route('**://api.arasaac.org/**', async (route: Route) => {
    const term = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');

    if ([...empty].some((needle) => term.toLowerCase().includes(needle))) {
      await route.fulfill({ status: 404, json: [] });
      return;
    }

    const base = idForTerm(term);
    // Single-word labels only: multi-word labels are deliberately downranked by
    // the provider, which would make ordering here harder to reason about.
    await route.fulfill({
      json: labelsForTerm(term).map((keyword, i) => ({
        _id: base + i,
        keywords: [{ keyword }],
        aac: i === 0,
        aacColor: i === 0,
        schematic: false,
      })),
    });
  });

  await page.route('**://static.arasaac.org/**', async (route: Route) => {
    if (options.failImages) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ body: PNG, contentType: 'image/png' });
  });
}

/** Reads persisted rows straight from IndexedDB — the source of truth. */
export async function readSentences(page: Page): Promise<
  {
    rawInput: string; title?: string | null; updatedAt: number;
    slots: { sourceToken: string; concept: string; origin: string; chosen: string | null }[];
  }[]
> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bildhaft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows: Record<string, unknown>[] = await new Promise((resolve) => {
      const q = db.transaction('sentences').objectStore('sentences').getAll();
      q.onsuccess = () => resolve(q.result);
    });
    return rows.map((r) => {
      const row = r as {
        rawInput: string; title?: string | null; createdAt: number; updatedAt: number;
        slots: Record<string, unknown>[];
      };
      return {
        rawInput: row.rawInput,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        slots: row.slots.map((s) => {
          const slot = s as {
            sourceToken: string; concept: string; origin: string;
            choice: Record<string, string | null>;
          };
          return {
            sourceToken: slot.sourceToken,
            concept: slot.concept,
            origin: slot.origin,
            chosen: slot.choice?.arasaac ?? null,
          };
        }),
      };
    }).sort((a, b) => a.createdAt - b.createdAt);
  });
}
