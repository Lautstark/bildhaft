import { expect, test, type Page } from '@playwright/test';
import { TEXTS } from '../src/i18n/texts.ts';
import { mockArasaac } from './arasaac-mock.ts';

/*
 * The two languages, and the half of a switch that is not labels.
 *
 * bildhaft was German-only by decision for as long as the matcher only
 * understood German. That stopped being true when bildquelle grew an English
 * pipeline, and the point of these is the part that is easy to leave behind:
 * a page can be turned to English and still ask ARASAAC's German endpoint for
 * English words. vorlaut shipped exactly that for months. Its German endpoint
 * does not refuse an English word - it answers one, out of its tags - so the
 * failure looks like a working page with the wrong picture on it.
 *
 * So these assert on the request as well as on what is drawn. The drawing was
 * never the part that lied.
 *
 * playwright.config.ts pins the whole suite to de-DE, which is what makes a
 * switch here a real change rather than a coincidence of the runner's locale.
 */

const says = (lang: 'de' | 'en', key: string) => TEXTS[lang]![key]!;

/** Einstellungen, from the sidebar, which starts collapsed. */
async function openSettings(page: Page, lang: 'de' | 'en'): Promise<void> {
  // Only if it is still away: once opened the toggle renames itself, so a call
  // that insisted on "einblenden" would wait for a button that is gone.
  const show = page.getByRole('button', { name: says(lang, 'ui.show_sidebar') });
  if (await show.count()) await show.click();
  await page.getByRole('button', { name: says(lang, 'ui.settings'), exact: true }).click();
}

/** ...and the language panel inside it, which since 2026-08-29 is already open
 *  when the dialog arrives: it is the first panel and the only one that opens
 *  on arrival, because somebody who cannot read this page needs it before the
 *  headings they cannot read either. Clicking it would close it, so this waits
 *  rather than presses - and the wait is the assertion that it really is open. */
async function openLanguagePanel(page: Page, lang: 'de' | 'en'): Promise<void> {
  await openSettings(page, lang);
  await page.getByRole('group', { name: says(lang, 'ui.set_language') }).waitFor();
}

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('./');
  // The composer is what says the app came up, rather than an empty document.
  await expect(page.getByLabel(says('de', 'ui.composer_label'))).toBeVisible();
});

test('opens in the language the browser asks for', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByLabel(says('de', 'ui.composer_label'))).toBeVisible();
});

test('switches to English, and stays there over a reload', async ({ page }) => {
  await openLanguagePanel(page, 'de');
  await page.getByRole('button', { name: 'English', exact: true }).click();

  // The switch reloads: see i18n/index.ts for why bildhaft does that and
  // vorlaut does not.
  await expect(page.getByLabel(says('en', 'ui.composer_label'))).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.getByLabel(says('en', 'ui.composer_label'))).toBeVisible();
  // The languages name themselves, so the way back is readable from either side.
  await openLanguagePanel(page, 'en');
  await expect(page.getByRole('button', { name: 'Deutsch', exact: true })).toBeVisible();
});

test('asks ARASAAC for the language the page is in', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('api.arasaac.org')) asked.push(new URL(url).pathname.split('/')[3]!);
  });

  const input = page.getByLabel(says('de', 'ui.composer_label'));
  await input.fill('Apfel');
  await input.press('Enter');
  await expect(page.locator('.row')).toHaveCount(1);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((lang) => lang === 'de')).toBe(true);

  await openLanguagePanel(page, 'de');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByLabel(says('en', 'ui.composer_label'))).toBeVisible();

  asked.length = 0;
  const english = page.getByLabel(says('en', 'ui.composer_label'));
  await english.fill('apple');
  await english.press('Enter');
  await expect(page.locator('.row')).toHaveCount(2);

  expect(asked.length).toBeGreaterThan(0);
  // The one that matters: not a single word went to the other language.
  expect(asked.filter((lang) => lang === 'de')).toEqual([]);
});

test('reads an English sentence with the English pipeline', async ({ page }) => {
  await openLanguagePanel(page, 'de');
  await page.getByRole('button', { name: 'English', exact: true }).click();

  const input = page.getByLabel(says('en', 'ui.composer_label'));
  await input.fill('Please clean up your room');
  await input.press('Enter');
  await expect(page.locator('.row')).toHaveCount(1);

  // Five words in, four slots out: "clean up" is one concept rather than two.
  // That merge is the rung the German pipeline does not have, so counting the
  // slots is enough to say English morphology ran rather than German. The
  // pronoun keeps its own slot on purpose - "your" is not a stopword here,
  // because possessives carry meaning on a board.
  await expect(page.locator('.row .slot')).toHaveCount(4);
});

test('says METACOM is named in German, but only where that is news', async ({ page }) => {
  await openLanguagePanel(page, 'de');
  await expect(page.getByText(says('en', 'ui.metacom_german_only'))).toHaveCount(0);

  await page.getByRole('button', { name: 'English', exact: true }).click();
  await openSettings(page, 'en');
  // The panel is named after the product, so it is the one heading that is
  // the same word in both languages.
  await page.getByText('METACOM', { exact: true }).click();
  await expect(page.getByText(says('en', 'ui.metacom_german_only'))).toBeVisible();
});

/*
 * The third way round, and the one a link introduced.
 *
 * The two above are about a page somebody switched. This is about a Sammlung
 * that arrived already written in a language the reader does not have the page
 * in: opened from lautstark.tech/sammlungen, „Kopfschmerzen" and „Zähne putzen"
 * on an interface somebody reads in English. The labels are their choice and
 * stay. What may not stay is the endpoint the search asks, for the reason at the
 * head of this file — it answers rather than refusing, so the failure looks like
 * a working page with the wrong picture on it.
 */
test('a Sammlung carries the language its symbols are searched in', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bildhaft.language', 'en'));
  await mockArasaac(page);
  await page.route('https://lautstark.tech/sammlungen/download/*.json', (route) => route.fulfill({
    json: {
      format: 'bildhaft.collection',
      version: 3,
      exportedAt: '2026-08-30T00:00:00.000Z',
      collection: { name: 'Auf Deutsch', language: 'de', sentenceIds: [] },
      sentences: [],
      notice: '',
    },
  }));

  await page.goto('/?sammlung=auf-deutsch');
  await expect(page.getByLabel(says('en', 'ui.collection_name'))).toHaveValue('Auf Deutsch');

  const asked = page.waitForRequest((request) => request.url().includes('/pictograms/'));
  const input = page.getByLabel(says('en', 'ui.composer_label'));
  await input.fill('Apfel');
  await input.press('Enter');

  // German, because the Sammlung is — while the page around it stays English.
  expect((await asked).url()).toContain('/pictograms/de/');
  await expect(page.getByLabel(says('en', 'ui.composer_label'))).toBeVisible();
});
