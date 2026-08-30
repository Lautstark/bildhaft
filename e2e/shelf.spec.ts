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

test('a link naming a Sammlung that is not there says so, and adds nothing', async ({ page }) => {
  await mockArasaac(page);
  await page.route(SHELF, (route) => route.fulfill({ status: 404, body: '' }));

  await page.goto('/?sammlung=weg-damit');

  await expect(page.getByText(/gibt es hier nicht|no such collection/i)).toBeVisible();
  // One Sammlung: the empty one every first visit starts with, and nothing else.
  await page.getByTitle('Seitenleiste einblenden').click();
  await expect(page.locator('.collections__item')).toHaveCount(1);
});
