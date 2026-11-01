import { expect, test, type Page } from '@playwright/test';
import { COLLECTION_KINDS, type CollectionKind } from '../src/core/types.ts';
import { TEXTS } from '../src/i18n/texts.ts';
import { idForTerm, mockArasaac } from './arasaac-mock.ts';

/*
 * Switching the page's language leaves every material as it was.
 *
 * The worry this answers: somebody made their material in English, turns the
 * interface to German, and the material is no longer what they made. Nothing
 * here may be re-matched, re-lemmatised, dropped or rewritten — and the sheet
 * that comes out of the printer may not change either.
 *
 * The materials are written straight into IndexedDB, one of every template,
 * and written the way every material made before 2026-11-01 is stored: with no
 * `language` on the Sammlung. That is the case that had a bug. „Absent" meant
 * „the page's language", which was harmless until the page's language could
 * move — after a switch an English Rezept printed „Zutaten" over "2 eggs", and
 * a line added to it went through the German pipeline. The switch now writes
 * the language down first (repo.ts `rememberLanguage`).
 *
 * The PDF is drawn from the same preview that is compared here (ui/pdf.ts), and
 * an Anybook code's words are the `standing` text the sheet carries, so a
 * sheet that reads the same is the evidence for both.
 */

const says = (lang: 'de' | 'en', key: string) => TEXTS[lang]![key]!;

const CHOICE = 'bildhaft.language';

type Row = { id: string; text: string; part?: string; label?: string; words: string[] };

/** One slot, as the pipeline would have stored it for an English word on ARASAAC. */
const slot = (word: string, label?: string) => ({
  id: `slot-${word}-${Math.random().toString(36).slice(2, 8)}`,
  sourceToken: word,
  concept: word.toLowerCase(),
  origin: 'lemma',
  choice: { arasaac: String(idForTerm(word)) },
  candidates: { arasaac: [{ id: String(idForTerm(word)), label: word, score: 1 }] },
  ...(label ? { label } : {}),
});

/** What each template holds, in English. Ids are the template's, so they cannot collide. */
function material(kind: CollectionKind): { collection: Record<string, unknown>; rows: Row[] } {
  const row = (n: number, text: string, words: string[], extra: Partial<Row> = {}): Row =>
    ({ id: `${kind}-${n}`, text, words, ...extra });
  const base = { id: `c-${kind}`, name: `English ${kind}`, ...(kind === 'satzstreifen' ? {} : { kind }) };
  switch (kind) {
    case 'satzstreifen':
      return { collection: base, rows: [row(1, 'I want an apple', ['I', 'want', 'apple']), row(2, 'Clean up your room', ['clean', 'your', 'room'])] };
    case 'wortkarten':
      return { collection: base, rows: [row(1, 'dog', ['dog']), row(2, 'cat', ['cat'])] };
    case 'einkaufsliste':
      return { collection: base, rows: [row(1, 'milk', ['milk']), row(2, 'bread', ['bread'])] };
    case 'tafel':
      return {
        collection: { ...base, board: { cols: 2, rows: 1, cells: ['tafel-1', 'tafel-2'] } },
        rows: [row(1, 'yes', ['yes']), row(2, 'no', ['no'])],
      };
    case 'rezept':
      return {
        collection: base,
        rows: [
          row(1, '2 eggs', ['eggs'], { part: 'zutat', label: '2 eggs' }),
          row(2, 'bowl', ['bowl'], { part: 'hilfsmittel' }),
          row(3, 'Mix the eggs', ['mix', 'eggs'], { part: 'schritt' }),
        ],
      };
    case 'lied':
      return {
        collection: { ...base, song: { parts: [{ id: 'p1', kind: 'strophe', lines: ['lied-1'] }, { id: 'p2', kind: 'refrain', lines: ['lied-2'] }], order: ['p1', 'p2', 'p1'] } },
        rows: [row(1, 'Twinkle twinkle little star', ['twinkle', 'star']), row(2, 'How I wonder', ['wonder'])],
      };
    case 'plauderbuch':
      return {
        collection: { ...base, talk: { pages: [{ id: 'pg1', question: 'plauderbuch-1', sayings: ['plauderbuch-2', 'plauderbuch-3'] }] } },
        rows: [row(1, 'What did you eat?', ['eat']), row(2, 'pasta', ['pasta']), row(3, 'soup', ['soup'])],
      };
    case 'spiel':
      return {
        collection: { ...base, game: { rows: [{ id: 'r1', zellen: [{ karte: 'spiel-1', platz: false }, { karte: 'spiel-2', platz: true }] }] } },
        rows: [row(1, 'sun', ['sun']), row(2, 'moon', ['moon'])],
      };
    case 'erzaehlen':
      return {
        collection: base,
        rows: [
          row(1, 'At the weekend I …', ['weekend'], { part: 'oben' }),
          row(2, 'park', ['park'], { part: 'mitte' }),
          row(3, 'And you?', ['you'], { part: 'unten' }),
        ],
      };
  }
}

/** Every template's material and an English Wortschatz entry, written as an older bildhaft wrote them. */
async function seed(page: Page): Promise<void> {
  const all = COLLECTION_KINDS.map(material);
  await page.evaluate(async (materials) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bildhaft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['collections', 'sentences', 'overrides'], 'readwrite');
    const now = Date.parse('2026-10-01T00:00:00Z');
    materials.forEach(({ collection, rows }, at) => {
      tx.objectStore('collections').put({ ...collection, createdAt: now + at, updatedAt: now + at });
      rows.forEach((row, n) => tx.objectStore('sentences').put({
        id: row.id,
        normalizedInput: row.text.toLowerCase(),
        rawInput: row.text,
        slots: row.slots,
        collectionId: collection.id,
        createdAt: now + n,
        updatedAt: now + n,
        ...(row.part ? { part: row.part } : {}),
      }));
    });
    tx.objectStore('overrides').put({
      key: 'en:arasaac:dog', lang: 'en', provider: 'arasaac', token: 'dog',
      symbolId: '777', label: 'Dog', updatedAt: now,
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  }, all.map(({ collection, rows }) => ({
    collection,
    rows: rows.map((row) => ({
      ...row,
      slots: row.label ? [slot(row.words[0]!, row.label)] : row.words.map((word) => slot(word)),
    })),
  })));
}

/** The four stores a material is made of, as they stand. */
async function dump(page: Page): Promise<Record<string, unknown[]>> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bildhaft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const out: Record<string, unknown[]> = {};
    for (const store of ['collections', 'sentences', 'overrides', 'ownImages']) {
      out[store] = await new Promise((resolve) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => resolve(q.result);
      });
    }
    db.close();
    return out;
  });
}

/** Opens one material from the sidebar, its template's group unfolded first. */
async function open(page: Page, lang: 'de' | 'en', kind: CollectionKind): Promise<void> {
  const name = page.locator('.collections__name', { hasText: `English ${kind}` });
  const group = page.getByRole('button', { name: says(lang, `ui.group_${kind}`), exact: true });
  if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
  await name.click();
}

/** Opens one material and reads its sheet: every word on it, and every picture. */
async function sheetOf(page: Page, lang: 'de' | 'en', kind: CollectionKind): Promise<{ text: string; pictures: string[] }> {
  await open(page, lang, kind);
  const peek = page.locator('.print-dock__peek');
  if (await peek.isVisible().catch(() => false)) await peek.click();
  const sheet = page.locator('.print-view .preview-frame .ps-sheet');
  await expect(sheet).toBeVisible();
  // Every picture drawn, rather than the first frame of a sheet still loading.
  await expect.poll(() => sheet.locator('img').evaluateAll(
    (all) => all.length > 0 && all.every((img) => (img as HTMLImageElement).complete))).toBe(true);
  // Settled: the same text twice in a row.
  let text = '';
  await expect.poll(async () => {
    const now = await sheet.innerText();
    const same = now === text;
    text = now;
    return same;
  }).toBe(true);
  const pictures = await sheet.locator('img').evaluateAll(
    (all) => all.map((img) => (img as HTMLImageElement).src.replace(/^blob:.*$/, 'blob')));
  return { text, pictures };
}

async function switchTo(page: Page, from: 'de' | 'en', to: 'de' | 'en'): Promise<void> {
  await page.getByRole('button', { name: says(from, 'ui.settings'), exact: true }).click();
  await page.getByRole('group', { name: says(from, 'ui.set_language') }).waitFor();
  await page.getByRole('button', { name: to === 'de' ? 'Deutsch' : 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', to);
}

test('switching the language leaves every material as it was', async ({ page }) => {
  test.setTimeout(120_000);
  await mockArasaac(page);
  // English on the first visit only: a reload after the switch must not undo it.
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(key, 'en');
  }, CHOICE);

  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.sidebar')).toBeVisible();
  await seed(page);
  await page.reload();
  await expect(page.locator('.sidebar')).toBeVisible();

  const before = new Map<CollectionKind, { text: string; pictures: string[] }>();
  for (const kind of COLLECTION_KINDS) before.set(kind, await sheetOf(page, 'en', kind));
  // The headings on a Rezept are what used to follow the page.
  expect(before.get('rezept')!.text).toContain(says('en', 'ui.recipe_zutat'));
  const stored = await dump(page);

  await switchTo(page, 'en', 'de');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('.sidebar')).toBeVisible();

  for (const kind of COLLECTION_KINDS) {
    expect(await sheetOf(page, 'de', kind), `the sheet of ${kind}`).toEqual(before.get(kind));
  }

  const after = await dump(page);
  // Rows, the Wortschatz and own pictures: not one field moved.
  expect(after.sentences).toEqual(stored.sentences);
  expect(after.overrides).toEqual(stored.overrides);
  expect(after.ownImages).toEqual(stored.ownImages);
  // A Sammlung gained one thing — the language it was written in, said out loud
  // now that the page's no longer says it for it — and lost nothing.
  const strip = (all: unknown[]) => (all as Record<string, unknown>[])
    .map(({ language: _, updatedAt: __, ...rest }) => rest)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  expect(strip(after.collections)).toEqual(strip(stored.collections));
  for (const collection of after.collections as { id: string; language?: string }[]) {
    expect(collection.language, collection.id).toBe('en');
  }
});

test('a line added to an English material after the switch is read in English', async ({ page }) => {
  await mockArasaac(page);
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(key, 'en');
  }, CHOICE);
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.sidebar')).toBeVisible();
  await seed(page);
  await page.reload();

  await switchTo(page, 'en', 'de');
  await open(page, 'de', 'satzstreifen');
  await expect(page.locator('.row')).toHaveCount(2);
  const untouched = (await dump(page)).sentences;

  const asked: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('api.arasaac.org')) asked.push(new URL(url).pathname.split('/')[3]!);
  });
  const input = page.getByLabel(says('de', 'ui.composer_label'));
  await input.fill('Please clean up your room');
  await input.press('Enter');
  await expect(page.locator('.row')).toHaveCount(3);

  // The English pipeline: "clean up" one concept, four slots out of five words.
  await expect(page.locator('.row').first().locator('.slot')).toHaveCount(4);
  // ...looked up at the English endpoint, not one word at the German one.
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.filter((lang) => lang !== 'en')).toEqual([]);
  // And the rows that were there are exactly as they were.
  const now = (await dump(page)).sentences as { id: string }[];
  for (const row of untouched as { id: string }[]) {
    expect(now.find((one) => one.id === row.id)).toEqual(row);
  }
});
