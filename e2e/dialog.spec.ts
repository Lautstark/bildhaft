import { expect, test } from '@playwright/test';

/*
 * What a modal has to do, and what this one could not do before.
 *
 * The sheet was a <div class="overlay"> holding a <div class="sheet">, with an
 * Escape listener on the document. It looked right, and every existing test
 * passed, because what it lacked was not visible: nothing trapped focus, so Tab
 * walked out of the settings sheet and into the sentence list behind it, and
 * nothing made the page inert, so a screen reader read straight through the
 * dim. It is a native <dialog> shown with showModal() now, which is what both
 * sibling products use.
 *
 * These check the properties, not the element — a future rewrite that keeps the
 * behaviour should keep these green.
 */

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  /* Wait for the app to have rendered before asking it anything.
   *
   * count() is the one query in this file that does not wait, and it drives a
   * branch — so before the first render it reads 0, which is indistinguishable
   * from "the sidebar is already open". The helper then skips the reveal and
   * waits five seconds for an Einstellungen button that is inside a collapsed
   * sidebar and never appears.
   *
   * The render is what has to be waited for rather than the load: app.ts reads
   * its settings out of IndexedDB and render() returns early until they arrive,
   * so a freshly loaded page is genuinely empty. That is why this only went red
   * on the run that builds first, under four workers, on a cold server — and
   * why it was always green in isolation.
   *
   * This line is the same one most spec files here do after goto(). menu.spec.ts
   * omits it and is safe anyway: its first act is a fill(), which waits by
   * itself. Every action in Playwright waits; count() is the exception, and
   * this was the only file branching on one. */
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();

  // Only if it is still away: the sidebar stays out once opened, and its
  // toggle is then called "ausblenden" — so a second call that insisted on
  // "einblenden" would wait for a button that no longer exists.
  const show = page.getByRole('button', { name: 'Seitenleiste einblenden' });
  if (await show.count()) await show.click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the sheet is a real modal, and says so once', async ({ page }) => {
  await openSettings(page);
  const sheet = page.locator('dialog.sheet');

  await expect(sheet).toHaveJSProperty('open', true);
  // :modal is true only for showModal(), never for a shown-but-not-modal dialog
  // and never for a div wearing the part.
  expect(await sheet.evaluate((node) => node.matches(':modal'))).toBe(true);
  // Both are implicit on a modal <dialog>; writing them again is how an element
  // gets announced twice.
  await expect(sheet).not.toHaveAttribute('role', /.*/);
  await expect(sheet).not.toHaveAttribute('aria-modal', /.*/);
  await expect(sheet).toHaveAttribute('aria-label', 'Einstellungen');
});

test('focus cannot leave the sheet while it is open', async ({ page }) => {
  await openSettings(page);
  const sheet = page.locator('dialog.sheet');

  // The composer is the most reachable thing behind the dim, and it is exactly
  // where Tab used to land.
  const escaped = await sheet.evaluate((node) => {
    const behind = document.querySelector<HTMLElement>('textarea, input');
    if (!behind || node.contains(behind)) return 'no element behind the sheet';
    behind.focus();
    return document.activeElement === behind;
  });
  expect(escaped).toBe(false);
  expect(await sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
});

test('Escape closes it, and closing it happens once however it is closed',
  async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('dialog.sheet')).toHaveCount(1);

    await page.keyboard.press('Escape');
    // Removed, not merely hidden: the handle's owner tears it down on close,
    // and a sheet left in the document is one the next open would duplicate.
    await expect(page.locator('dialog.sheet')).toHaveCount(0);

    await openSettings(page);
    await page.getByRole('button', { name: 'Dialog schließen' }).click();
    await expect(page.locator('dialog.sheet')).toHaveCount(0);
  });

test('a press on the backdrop closes it, a press on the sheet does not',
  async ({ page }) => {
    await openSettings(page);
    const sheet = page.locator('dialog.sheet');

    // Inside first: the sheet's own padding is the case that made this subtle,
    // because a press there lands on the dialog element just as the backdrop
    // does. Only the coordinates tell them apart.
    const box = (await sheet.boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + 4);
    await expect(sheet).toHaveCount(1);

    await page.mouse.click(8, 8);
    await expect(sheet).toHaveCount(0);
  });
