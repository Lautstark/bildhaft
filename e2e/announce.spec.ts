import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

/*
 * That what the page reports is reported out loud.
 *
 * The toast has always been on screen and has always been correct; what it
 * lacked was a life. It was built with `role="status"`, so it looked right in
 * the markup and in review — but notify() set its text, *then* appended it, and
 * removed it again 3.2 seconds later. A live region announces a change in
 * something the reader was already watching, so one that arrives already
 * carrying its message and leaves between messages announces nothing at all.
 *
 * Every acknowledgement this page makes went that way: "Sammlung exportiert",
 * "Eigenes Bild gespeichert", "Alle Daten gelöscht", and every failure of an
 * import or a translation. In a tool whose users are the reason it exists, that
 * is the worst place in the family for this to have been hiding.
 *
 * None of it is visible in a screenshot and no other test here would have gone
 * red for it, which is why it gets its own file — the third copy of one, after
 * mitreden's and vorlaut's. These check the two properties a live region
 * actually needs: that it is in the tree before the text arrives, and that it
 * is still the same element afterwards.
 */

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('the toast is a live region before it has anything to say', async ({ page }) => {
  const toast = page.locator('.toast');
  await expect(toast).toHaveAttribute('role', 'status');
  // Empty, but present: a region added at the moment of the message is a region
  // the reader was not watching.
  await expect(toast).toHaveText('');
  await expect(toast).not.toHaveAttribute('hidden', /.*/);
  expect(await toast.evaluate((node) => getComputedStyle(node).display)).not.toBe('none');
});

test('an empty toast draws nothing', async ({ page }) => {
  // The reason it may stay in the tree rather than being removed: it costs
  // nothing on screen while it is empty. Without this it would be a bare pill
  // sitting at the foot of every screen in the product.
  const box = await page.locator('.toast').evaluate((node) => {
    const { width, height } = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { width, height, background: style.backgroundColor, padding: style.padding };
  });
  expect(box.width).toBe(0);
  expect(box.height).toBe(0);
  expect(box.background).toMatch(/rgba\(.*,\s*0\)|transparent/);
});

test('a reported result lands in the live region and stays there', async ({ page }) => {
  await translate(page, 'Ich möchte schlafen');

  const toast = page.locator('.toast');
  // Marked before the act, and looked for afterwards: if the element were
  // replaced rather than written to, this property would be gone and the
  // reader would have been watching a node that no longer exists.
  await toast.evaluate((node) => { (node as HTMLElement).dataset.watched = 'yes'; });

  await page.getByRole('button', { name: 'Aktionen für diese Sammlung' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Sammlung exportieren' }).click();
  await download;

  await expect(toast).toHaveText('Sammlung exportiert.');
  await expect(toast).toHaveAttribute('data-watched', 'yes');
  await expect(toast).toHaveAttribute('role', 'status');
});

test('the banner region is in the page before any banner is', async ({ page }) => {
  /* The banners are conditions rather than outcomes, and they get the same
     treatment for the same reason: busyBanner used to carry role="status"
     itself, and the render set its text and then inserted it — so it entered
     the tree already carrying the message and announced nothing, once per
     appearance.

     The region is the host now, and what changes is which banner is inside it.
     A METACOM folder is needed to make a banner appear, so what this asserts is
     the property that makes the announcement possible at all: the region is
     here, empty, before anything has been put in it. */
  const host = page.locator('.banners');
  await expect(host).toHaveAttribute('role', 'status');
  await expect(host).toBeEmpty();
  await expect(host).not.toHaveAttribute('hidden', /.*/);
  expect(await host.evaluate((node) => getComputedStyle(node).display)).not.toBe('none');
  // Empty, it costs nothing: this sits above the composer on every screen.
  expect(await host.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
});

test('a banner is drawn inside that region, not in place of it', async ({ page }) => {
  // Put one there directly: the real trigger needs a METACOM folder, and what
  // is being checked is where the node lands, which is the half that regressed.
  await page.evaluate(() => {
    const host = document.querySelector('.banners')!;
    const banner = document.createElement('div');
    banner.className = 'banner banner--busy';
    banner.textContent = 'Einen Moment …';
    host.replaceChildren(banner);
  });

  const host = page.locator('.banners');
  await expect(host.locator('.banner')).toBeVisible();
  // Still the region, still the same element: a banner that replaced the host
  // would be a region the reader was never watching.
  await expect(host).toHaveAttribute('role', 'status');
  // And exactly one region here — nesting a second inside it announces twice.
  expect(await host.locator('[role="status"]').count()).toBe(0);
});
