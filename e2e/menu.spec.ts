import { expect, test } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

/*
 * That an open menu can be reached without a mouse.
 *
 * This menu had the roles from the start — it is the only one of the three
 * that did — so what is checked here is the part it was still missing:
 * opening it left focus on the trigger, the arrows did nothing, and closing it
 * dropped focus on <body>.
 *
 * The last test is the one that is particular to this page. Its export item is
 * disabled while the Sammlung is empty, and a disabled item is not somewhere
 * the keyboard should be able to land — so "the first item" and "the first
 * enabled item" are different things here, and only one of them is right.
 */

const menu = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Aktionen für diese Sammlung' });

test.beforeEach(async ({ page }) => {
  await mockArasaac(page);
  await page.goto('/');
});

test('opening a menu puts focus in it', async ({ page }) => {
  await translate(page, 'Ich möchte schlafen');
  await menu(page).click();
  // The whole defect: focus on the trigger means the menu is open only in the
  // drawing.
  await expect(page.locator('.menu button').first()).toBeFocused();
});

test('the arrows and Home/End walk the list', async ({ page }) => {
  await translate(page, 'Ich möchte schlafen');
  await menu(page).click();

  const items = page.locator('.menu button');
  const count = await items.count();
  expect(count).toBeGreaterThan(1);

  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.nth(0)).toBeFocused();
  // Round rather than stopping.
  await page.keyboard.press('ArrowUp');
  await expect(items.nth(count - 1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.nth(count - 1)).toBeFocused();
});

test('Escape closes the menu and hands focus back', async ({ page }) => {
  await translate(page, 'Ich möchte schlafen');
  const trigger = menu(page);
  await trigger.click();
  await page.keyboard.press('Escape');

  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('a click elsewhere closes the menu without stealing focus', async ({ page }) => {
  await translate(page, 'Ich möchte schlafen');
  await menu(page).click();

  const input = page.getByLabel('Satz eingeben');
  await input.click();
  await expect(page.locator('.menu')).toHaveCount(0);
  // The other side of the rule: this close is not keyboard-driven, so pulling
  // focus back to the trigger would take it out of the field just clicked.
  await expect(input).toBeFocused();
});

test('focus skips an item it is not allowed to use', async ({ page }) => {
  // No sentences, so exporting the Sammlung is disabled and deleting it is not.
  await menu(page).click();

  const first = page.locator('.menu button').first();
  await expect(first).toBeDisabled();
  // Landing on the disabled item would announce an action that cannot be
  // taken and leave the arrows to walk off it.
  await expect(first).not.toBeFocused();
  await expect(page.locator('.menu button:not([disabled])').first()).toBeFocused();
});
