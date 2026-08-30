import { expect, test } from '@playwright/test';
import { idForTerm, labelsForTerm, mockArasaac, readSentences } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('turns a sentence into symbols and drops function words', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  // "einen" is an article and must not get a slot of its own.
  await expect(page.locator('.row').first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'Apfel', 'essen']);

  const images = page.locator('.row .slot img');
  await expect(images).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect
      .poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }
});

test('reassembles a separable verb into one slot', async ({ page }) => {
  await translate(page, 'Räum bitte dein Zimmer auf');

  const [row] = await readSentences(page);
  const separable = row.slots.find((s) => s.origin === 'separable');
  expect(separable?.concept).toBe('aufräumen');
  // The trailing particle must not also appear as its own slot.
  expect(row.slots.map((s) => s.sourceToken)).not.toContain('auf');
});

test('never silently drops a word it cannot match', async ({ page }) => {
  await mockArasaac(page, { emptyFor: ['xylo'] });
  await page.goto('/');
  await translate(page, 'Ich mag Xylowurst');

  const [row] = await readSentences(page);
  const unmatched = row.slots.find((s) => s.sourceToken === 'Xylowurst');
  expect(unmatched).toBeDefined();
  expect(unmatched?.chosen).toBeNull();
});

test('remembers a correction and applies it to later sentences', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');

  // Correct "Apfel" to the second offered symbol.
  await page.locator('.row').first().locator('.slot', { hasText: 'Apfel' }).click();
  const alternative = labelsForTerm('Apfel')[1];
  await page.locator('.picker__item', { hasText: alternative }).first().click();
  await expect(page.locator('dialog.sheet')).toHaveCount(0);

  const expectedId = String(idForTerm('Apfel') + 1);
  await expect.poll(async () => {
    const rows = await readSentences(page);
    return rows[0].slots.find((s) => s.sourceToken === 'Apfel')?.chosen;
  }).toBe(expectedId);

  // The personal dictionary should now win for a brand new sentence.
  await translate(page, 'Der Apfel ist rot');

  await expect.poll(async () => {
    const rows = await readSentences(page);
    const slot = rows[1].slots.find((s) => s.sourceToken === 'Apfel');
    return `${slot?.origin}:${slot?.chosen}`;
  }).toBe(`override:${expectedId}`);
});

test('supports adding, removing and reordering slots', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const row = page.locator('.row').first();

  // Add a slot from the picker's own search.
  await row.locator('.slot-add').click();
  await page.getByLabel('Symbol suchen').fill('Banane');
  await page.locator('.picker__item', { hasText: 'Banane' }).first().click();
  await expect(row.locator('.slot')).toHaveCount(5);
  await expect(row.locator('.slot__label').last()).toHaveText('Banane');

  // Reorder with the keyboard; drag is covered separately by the mouse test.
  await row.locator('.slot').first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(row.locator('.slot__label')).toHaveText(['möchte', 'Ich', 'Apfel', 'essen', 'Banane']);

  // Removing a slot removes the whole field, not just its symbol.
  await row.locator('.slot', { hasText: 'Banane' }).click();
  await page.getByRole('button', { name: 'Feld entfernen' }).click();
  await expect(row.locator('.slot')).toHaveCount(4);
});

test('reorders slots by dragging', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  const row = page.locator('.row').first();

  await row.locator('.slot').nth(3).dragTo(row.locator('.slot').nth(0));
  await expect(row.locator('.slot__label')).toHaveText(['essen', 'Ich', 'möchte', 'Apfel']);
});

test('keeps the collection after a reload', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await page.reload();

  await expect(page.locator('.row')).toHaveCount(1);
  await expect(page.locator('.row').first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'Apfel', 'essen']);
});

test('offers a previous translation of the same line', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  // Punctuation and casing must not defeat the lookup.
  await page.getByLabel('Satz eingeben').fill('ich möchte einen apfel essen.');
  await expect(page.locator('.composer__reuse')).toContainText('schon übersetzt');
});

test('shows a retry affordance instead of an endless spinner', async ({ page }) => {
  await mockArasaac(page, { failImages: true });
  await page.goto('/');
  await translate(page, 'Ich möchte einen Apfel essen');

  // The failure must resolve to a visible error state, never a permanent spinner.
  await expect(page.locator('.slot__blank--error').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.slot__blank .spinner')).toHaveCount(0);
});

test('makes one row per line of a multi-line entry', async ({ page }) => {
  const input = page.getByLabel('Satz eingeben');
  // Shift+Enter puts a newline in the box; Enter then submits the lot.
  await input.fill('Ich möchte einen Apfel essen\n\nDer Hund liegt unter dem Tisch');
  await input.press('Enter');

  const rows = page.locator('.row');
  await expect(rows).toHaveCount(2);
  // Reading order, top to bottom — these get printed as strips in this order.
  await expect(rows.first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'Apfel', 'essen']);
  await expect(rows.last().locator('.slot__label'))
    .toHaveText(['Hund', 'liegt', 'unter', 'Tisch']);

  // And it survives a reload, which is where the ordering could silently flip.
  await page.reload();
  await expect(rows.first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'Apfel', 'essen']);
});

/*
 * A pasted text is the case this was written for: a song or a page of a picture
 * book, dozens of lines, each one a chain of lookups. Translating the lot before
 * anything appeared meant an empty page for as long as the slowest network took,
 * which reads as a hang rather than as work — so the rows have to land as they
 * come, and the wait has to say how far it has got.
 *
 * One line is held back by the route rather than by a timer, so what is asserted
 * is the half-done state itself and not a guess about how long it lasts.
 */
test('a long text fills in line by line, and says how far it has got', async ({ page }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**://api.arasaac.org/**', async (route) => {
    const term = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    if (term.toLowerCase().startsWith('schnecke')) await held;
    await route.fallback();
  });

  const input = page.getByLabel('Satz eingeben');
  await input.fill([
    'Der Hund liegt unter dem Tisch',
    'Die Katze schläft',
    'Der Vogel singt',
    'Die Schnecke kriecht',
  ].join('\n'));
  await input.press('Enter');

  // Three rows are on the page while the fourth is still out at the source.
  const rows = page.locator('.row');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('.banner--busy')).toContainText('von 4');
  // And the box is already empty, which is the other half of "it took the text".
  await expect(input).toHaveValue('');

  release();
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.banner--busy')).toHaveCount(0);

  /* Reading order, top to bottom. The lines are translated several at a time
     now, so the order rows arrive in is not the order they were typed in — and
     that order is what gets printed. */
  await expect(rows.first().locator('.slot__label'))
    .toHaveText(['Hund', 'liegt', 'unter', 'Tisch']);
  await expect(rows.last().locator('.slot__label')).toHaveText(['Schnecke', 'kriecht']);
});

test('a focused field inside a sheet is not clipped by its scroll region', async ({ page }) => {
  await translate(page, 'Ich möchte einen Apfel essen');
  await page.locator('.row').first().locator('.slot-add').click();

  const field = page.getByLabel('Symbol suchen');
  await field.click();

  /*
   * The focus ring is drawn outside the element, and the sheet's body scrolls.
   * Too little padding there and the ring is cut off along the scroll edge —
   * which looks like a rendering fault rather than the missing few pixels it is.
   */
  const clipped = await field.evaluate((input) => {
    const style = getComputedStyle(input);
    const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const ring = input.getBoundingClientRect();
    const region = input.closest('.body')!.getBoundingClientRect();
    return {
      reach,
      top: Math.round(region.top - (ring.top - reach)),
      left: Math.round(region.left - (ring.left - reach)),
      right: Math.round((ring.right + reach) - region.right),
    };
  });
  // A ring that stopped being drawn would pass every edge check trivially.
  expect(clipped.reach).toBeGreaterThan(0);
  // Positive on any edge means the ring reaches past what the region will show.
  expect(clipped).toMatchObject({ top: 0, left: 0, right: 0 });
});

test('crosses a symbol out for a negation, and keeps it crossed', async ({ page }) => {
  await translate(page, 'Ich möchte schlafen');

  const slot = page.locator('.row').first().locator('.slot', { hasText: 'schlafen' });
  await expect(slot.locator('.negate')).toHaveCount(0);

  await slot.click();
  await page.getByLabel('Symbol durchstreichen').check();
  // Crossing out is not a choice of symbol, so the dialog stays open for the
  // next thing the user wants to do to this field.
  await expect(page.locator('dialog.sheet')).toBeVisible();
  await expect(slot.locator('.negate')).toHaveCount(1);

  await page.locator('.sheet .foot').getByRole('button', { name: 'Fertig' }).click();
  // Gone from the DOM, not merely invisible — closing removes the sheet, and
  // toBeHidden() would keep passing if a change ever only hid it.
  await expect(page.locator('dialog.sheet')).toHaveCount(0);

  // Written through to storage, not just painted: a reload has to show it again.
  await page.reload();
  await expect(page.locator('.row').first().locator('.slot', { hasText: 'schlafen' })
    .locator('.negate')).toHaveCount(1);

  // And it has to reach paper — the cross is the whole point of the feature.
  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect(page.locator('.preview-frame .ps-sheet')).toBeVisible();
  await expect(page.locator('.preview-frame .ps-card .negate')).toHaveCount(1);
  await expect(page.locator('#print-root .ps-card .negate')).toHaveCount(1);
});
