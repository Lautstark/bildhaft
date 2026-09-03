import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';

/*
 * Opening a Sammlung the address names — `?sammlung=<id>`.
 *
 * At this level rather than in a unit test because openNamed() lives inside
 * mountApp's closure, along with everything it touches: the toast, the
 * collection list, and the import that already knows how to open what it made.
 * Reaching in to test it would mean prising all four of those apart for the
 * test's convenience.
 *
 * The shelf is routed, never really asked. The id check itself is
 * @lautstark/werkzeuge/sammlung's and is tested there; what these two care
 * about is which of this page's answers each result gets.
 */

const SHELF = 'https://lautstark.tech/sammlungen/download/*.json';

/** A bildhaft export of one Sammlung, as the shelf would publish one. */
const published = {
  format: 'bildhaft.collection',
  version: 3,
  exportedAt: '2026-08-30T00:00:00.000Z',
  collection: { name: 'Vom Regal', sentenceIds: [] },
  sentences: [],
  notice: '',
};

test('a link naming a Sammlung opens it', async ({ page }) => {
  await mockArasaac(page);
  await page.route(SHELF, (route) => route.fulfill({ json: published }));

  await page.goto('/?sammlung=vom-regal');

  // The Sammlung the file names, opened. The name field is what says which one
  // is in front of you; the rail is what says it arrived at all.
  await page.getByTitle('Seitenleiste einblenden').click();
  await expect(page.locator('.collections__name', { hasText: 'Vom Regal' })).toBeVisible();
  await expect(page.getByLabel('Name der Sammlung')).toHaveValue('Vom Regal');

  /* And the address is clean afterwards, or a reload is a second copy of a
     Sammlung somebody may have since edited. */
  expect(new URL(page.url()).searchParams.has('sammlung')).toBe(false);
});

/* The bug this file was written a day too early to catch: a Sammlung published
   with ARASAAC choices, opened by somebody working in METACOM, arrived with
   every symbol blank. Nothing was wrong with the file — no slot had a choice for
   the source in front of them, and nothing asked. Here the published file
   carries a choice for a provider that is not the active one, which is the same
   shape from the other side. */
test('a Sammlung made in another symbol source still shows symbols', async ({ page }) => {
  await mockArasaac(page);
  await page.route(SHELF, (route) => route.fulfill({
    json: {
      ...published,
      collection: { name: 'Aus einer anderen Quelle', sentenceIds: [] },
      sentences: [{
        id: 's0',
        rawInput: 'Apfel',
        normalizedInput: 'apfel',
        slots: [{
          id: 's0-0',
          sourceToken: 'Apfel',
          concept: 'apfel',
          origin: 'lemma',
          // A choice for a source this reader does not use, and none for the
          // one they do — which is exactly what a shared file looks like.
          choice: { metacom: 'irgendwo/apfel.png' },
          candidates: {},
        }],
      }],
    },
  }));

  await page.goto('/?sammlung=aus-einer-anderen-quelle');

  await expect(page.getByLabel('Name der Sammlung')).toHaveValue('Aus einer anderen Quelle');
  // Resolved on arrival, against the source actually in front of the reader:
  // one slot, carrying a picture rather than an empty frame.
  const slot = page.locator('.row').first().locator('.slot', { hasText: 'Apfel' });
  await expect(slot).toBeVisible();
  await expect(slot.locator('.slot__img img')).toBeVisible();
});

test('a link naming a Sammlung that is not there says so, and adds nothing', async ({ page }) => {
  await mockArasaac(page);
  await page.route(SHELF, (route) => route.fulfill({ status: 404, body: '' }));

  await page.goto('/?sammlung=weg-damit');

  await expect(page.getByText(/gibt es hier nicht|no such collection/i)).toBeVisible();
  // One Sammlung: the empty one every first visit starts with, and nothing else.
  await page.getByTitle('Seitenleiste einblenden').click();
  await expect(page.locator('.sidebar__section--collections .collections__item')).toHaveCount(1);
});
