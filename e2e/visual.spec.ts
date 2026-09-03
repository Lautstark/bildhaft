import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Before pictures of the settings dialog, taken so that a move of CSS can be
 * shown to have moved nothing else.
 *
 * The panels in this dialog are drawn by packages — @lautstark/sicherung's
 * ablage-panel and backup-panel — while the rules that make them look like
 * anything still live in this product's src/styles/app.css, under class names
 * the packages chose. That split is about to close: the rules go to
 * @lautstark/design so that all four programmes get the same panel rather than
 * a family resemblance, which is the same correction the markup already had.
 *
 * A move like that is meant to be invisible, and "meant to be" is exactly the
 * claim no existing test here makes. Every other spec in this directory asserts
 * behaviour — a folder is adopted, a heading carries its state, focus stays in
 * the sheet — and all of them stay green through a stylesheet that lost a
 * margin, a border radius or a gap. So these are pictures, and the point of a
 * picture is that it has no opinion about which pixels matter.
 *
 * What is being asserted is therefore narrow and worth saying out loud: **the
 * settings surfaces look today exactly as they looked before the CSS moved.**
 * A red run here is not by itself a bug. It is the diff image being worth
 * looking at, and the two answers are "that is the change I meant" — then
 * re-record — or "the move dropped something".
 *
 * ## Why the element and not the page
 *
 * Each shot is of the smallest node that holds the subject. A full-page
 * screenshot of this app would carry the composer, the rail, the toast area and
 * whatever a Sammlung happens to contain, and every one of those is a way for
 * this file to go red about something it was not written to watch. The whole
 * sheet is the widest shot taken, and it is taken because the column of folded
 * headings — and which one of them is open on arrival — is itself one of the
 * things the move could disturb.
 */

/*
 * The viewport, pinned here rather than taken from the project.
 *
 * The desktop project is Playwright's Desktop Chrome, which is 1280×720. The
 * sheet is capped at 85vh and its body scrolls inside that, so at 720 the
 * dialog shot would be a picture of an arbitrary scroll position and the panel
 * shots would each be taken after a scroll of their own. 960 is enough for the
 * whole sheet to stand in the frame with the tallest panel open, which makes
 * every shot below a picture of the same thing every time.
 *
 * It also decouples these baselines from the project's device: a Playwright
 * upgrade that changes what Desktop Chrome measures would otherwise re-render
 * every one of them at once, and that diff would say "everything changed" on a
 * run where nothing did.
 */
test.use({ viewport: { width: 1280, height: 960 } });

/*
 * Where the baselines are, and the one condition under which this file has
 * nothing to say.
 *
 * Playwright files a snapshot per project *and per platform*, because a font is
 * rasterised differently on macOS and on Linux and no amount of masking makes
 * those two images equal. The baselines committed beside this file were
 * recorded on the machine the CSS move is being done on; the CI runner is
 * ubuntu-latest and has none. A missing baseline is not a regression, and a
 * check that goes red on a runner for a reason unrelated to the change is a
 * check people learn to ignore — so where there is no picture to compare
 * against, this file says so and skips.
 *
 * To give a platform baselines of its own, run the suite there once with
 * `npx playwright test e2e/visual.spec.ts --update-snapshots` and commit what
 * it writes. From that moment the file is live on that platform, with no change
 * here: the guard asks the directory, not a list.
 *
 * For Linux — the platform that matters, because it is the one CI compares on —
 * that run has somewhere to happen now: `.github/workflows/baselines.yml`, by
 * hand from the Actions tab. It does exactly the above on ubuntu-latest and
 * hands the `-linux.png` files back as an artifact, to download and commit
 * beside the darwin ones. It cannot be done from a laptop here: the runner
 * image is amd64 and segfaults under QEMU on Apple Silicon, and an arm64 image
 * would produce pictures nobody could prove match the runner.
 */
const SNAPSHOTS = fileURLToPath(new URL('./visual.spec.ts-snapshots', import.meta.url));

function recordedHere(): boolean {
  if (!existsSync(SNAPSHOTS)) return false;
  return readdirSync(SNAPSHOTS).some((name) => name.endsWith(`-${process.platform}.png`));
}

test.beforeEach(async ({ page }, testInfo) => {
  /* 'missing' and 'none' are the modes that only ever compare; 'all' and
     'changed' are the ones that write, and a run that is here to write must not
     skip itself out of ever producing a first baseline. */
  const recording = testInfo.config.updateSnapshots === 'all'
    || testInfo.config.updateSnapshots === 'changed';
  test.skip(!recording && !recordedHere(),
    `No baseline recorded for ${process.platform}. See the note in this file.`);

  await page.goto('/');
});

/**
 * Opens the settings sheet, the way dialog.spec.ts does.
 *
 * The wait on the composer is the same one that file explains at length: the
 * app reads its settings out of IndexedDB before it renders anything, so a
 * freshly loaded page is genuinely empty, and `count()` below is the one query
 * that does not wait for that on its own.
 */
async function openSettings(page: Page): Promise<Locator> {
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  const show = page.getByRole('button', { name: 'Seitenleiste einblenden' });
  if (await show.count()) await show.click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  return page.locator('dialog.sheet');
}

/** Opens one folded panel by its heading and answers the panel itself. */
async function openPanel(page: Page, heading: string): Promise<Locator> {
  const panel = page.locator('dialog.sheet details.panel', { hasText: heading });
  await panel.locator('summary').click();
  await expect(panel).toHaveJSProperty('open', true);
  return panel;
}

/** One panel's heading state line, located the way theme.spec.ts locates it. */
const stateOf = (page: Page, heading: string): Locator =>
  page.locator('dialog.sheet .panel', { hasText: heading }).locator('> summary .state');

/**
 * The three lines that can say something different on the next run, painted
 * over rather than compared.
 *
 * A masked box is still a box: Playwright lays a magenta rectangle over each
 * match, so position and size stay in the picture and a line that moves, wraps
 * or changes height still fails. What is given up is the glyphs — the size, the
 * colour and the alignment of that one line — and that is a real loss in a file
 * whose whole subject is CSS. So the mask is kept to where the words are a fact
 * about the machine rather than about this page:
 *
 *   „Wo alles liegt" · .state    backup-panel's headline: „Ordner „X" ·
 *                                gesichert vor 3 Minuten". A folder somebody
 *                                picked, and an age that differs between two
 *                                runs a minute apart. This is the one the
 *                                `mask` option is really for.
 *
 *   METACOM · .state             The symbol total and the root name of a
 *                                licensed folder on whichever machine is
 *                                running this. Nobody else's directory names
 *                                belong in a committed picture.
 *
 *   .backup-panel .standing      The same age spelled out, in the sentence
 *                                inside the panel. `data-state` decides that
 *                                line's colour and is not masked: the mask
 *                                covers the text, the box keeps whatever the
 *                                stylesheet gives it.
 *
 * The other four headings — Sprache, ARASAAC, Funktionswörter, Erscheinungsbild
 * — are left in the picture on purpose. Their state lines are the page's own
 * words for a setting, constant in the bundle, and they are exactly the kind of
 * small right-aligned type a moved stylesheet loses quietly.
 *
 * All of it rests on each test getting its own browser context: IndexedDB is
 * empty, no store folder is adopted, no backup folder is granted, and every
 * panel is therefore in the state a first visit is in. The three lines above
 * are blank or absent in that state, which is why masking them costs nothing
 * here and is still the right instruction to leave behind for a machine that
 * has adopted a folder.
 *
 * The `pre.tree` drawing of the folder layout is deliberately not masked. Its
 * content comes from the package rather than from the machine, and it is drawn
 * almost entirely by the CSS that is about to move — masking it would blind this
 * file to the part of the panel with the most to lose.
 *
 * `.standing` is scoped to an open panel. A closed <details> in Chromium keeps
 * its contents' last measured geometry while painting none of it, and `mask`
 * believes that geometry: an unscoped `.standing` gets a magenta rectangle laid
 * across whatever now happens to be at those coordinates, which is how the
 * first version of this file put a pink bar through the „Alles löschen" shot.
 */
function dynamic(page: Page): Locator[] {
  return [
    stateOf(page, 'Wo alles liegt'),
    stateOf(page, 'METACOM'),
    page.locator('dialog.sheet .panel[open] .backup-panel .standing'),
  ];
}

test('the settings sheet, as it opens', async ({ page }) => {
  const sheet = await openSettings(page);

  /* No panel is touched first: which one is open on arrival is a decision — see
     settingsDialog.ts on why it is Sprache — and a column of headings with
     exactly one of them unfolded is what this shot is of. */
  await expect(sheet.locator('details.panel')).toHaveCount(7);
  await expect(sheet).toHaveScreenshot('settings-sheet.png', { mask: dynamic(page) });
});

/*
 * The one this file was written for, in two frames.
 *
 * „Wo alles liegt" is two packaged panels stacked: @lautstark/sicherung's
 * ablage-panel — the store, its explanatory tree, the states — and, under a
 * hairline, its backup-panel for the standing snapshot, with what bildhaft
 * alone offers between and below them. Almost every class name in it
 * (.where-panel, .where, .tree, .acts, .backup-panel, .standing, .dot) is a
 * package's name for a rule kept in this product's stylesheet, which is the
 * whole reason those rules are moving.
 *
 * **Why the sheet and not the panel element, here alone.** The sheet is capped
 * at `min(88vh, 800px)` and its body scrolls inside that; unfolded, this panel
 * is taller than the body can show. An element screenshot of it would therefore
 * be a picture of a box whose lower part the body clips — Playwright captures
 * the element's rectangle from what is actually painted there, and what is
 * painted below the body is the sheet's foot. The first version of this file
 * did exactly that and produced a shot with the credit line lying across the
 * import buttons. The honest frame is the sheet: it is a fixed 600×800 box, it
 * is all real pixels, and it is what a person looking at this panel sees.
 *
 * Two shots, then, at the two ends of the body's scroll. The scroll positions
 * are set outright rather than scrolled into view, because 0 and the maximum
 * are the two offsets that are a fact about the box rather than about where a
 * particular element happened to land.
 */
test('the „Wo alles liegt" panel, unfolded', async ({ page }) => {
  const sheet = await openSettings(page);
  const panel = await openPanel(page, 'Wo alles liegt');

  /* Both halves are there before anything is taken. The store panel is drawn
     synchronously; the backup panel is null in a browser with no directory
     picker, and this project is Chromium, which has one — so if it were missing
     the pictures below would be quietly half a panel. */
  await expect(panel.locator('.where-panel')).toBeVisible();
  await expect(panel.locator('.backup-panel')).toBeVisible();

  const body = sheet.locator('> .body');
  await body.evaluate((node) => { node.scrollTop = 0; });
  await expect(sheet).toHaveScreenshot('data-panel-top.png', { mask: dynamic(page) });

  /* The rest of the same panel: the hairline, „Herausnehmen und einlesen", the
     notice, and the backup panel with its status line and its buttons. */
  await body.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect(sheet).toHaveScreenshot('data-panel-rest.png', { mask: dynamic(page) });
});

/*
 * METACOM, which nothing here had ever photographed.
 *
 * **Why this shot exists, and the measurement that asked for it.** The block
 * inside this panel is `@lautstark/bildquelle/metacom-panel`'s markup drawn by
 * `@lautstark/design`'s `.metacom-panel` rules — a package's DOM styled from a
 * second package, which is exactly the position the „Wo alles liegt" test above
 * describes for the two Sicherung boxes. components.css says so beside the
 * rules in as many words: they were added with no product emitting the class
 * yet, and the migration is where their drawing has to be checked. This is that
 * check.
 *
 * **The three shots above could not have been it, and their silence proves it
 * rather than clearing anything.** None of them unfolds this panel, so the
 * block's licence paragraph, its state line and its four buttons appear on no
 * baseline at all. What is visible of METACOM elsewhere is one line — the state
 * in its folded heading — and `dynamic()` below paints a rectangle over exactly
 * that line. The rectangle does not even change size when the sentence does:
 * `.panel > summary .state` is `flex: 1 1 auto`, so it fills the row whatever is
 * in it. Migrating the whole panel therefore left all three pictures
 * byte-identical, which looks like "nothing moved" and means "nothing was
 * looked at". vorlaut-editor reached the same conclusion the same way.
 *
 * The element and not the sheet, for the „Alles löschen" reason below: with no
 * folder connected this panel is a paragraph, a link, a state line and a row of
 * buttons, which stands inside the sheet's body with room to spare.
 *
 * `dynamic()` all the same, though nothing in a fresh context needs it here —
 * every test gets its own browser profile, so there is no adopted folder whose
 * name could reach a committed picture. Kept because the instruction is the
 * file's, not this test's, and because it costs this shot nothing: it covers the
 * folded heading's line, while the block's own state line and dot — which is the
 * part `.standing[data-state]` draws and the part that had never been checked —
 * are in the picture.
 */
test('the METACOM panel, unfolded', async ({ page }) => {
  await openSettings(page);
  const panel = await openPanel(page, 'METACOM');

  /* The block is really there before anything is taken. `.metacom-panel` is the
     package's own class name, so this fails loudly if the module ever stops
     emitting it — rather than quietly photographing an empty panel and holding
     every later run to that. */
  await expect(panel.locator('.metacom-panel')).toBeVisible();
  // Its two halves that this migration is about: the state line with its dot,
  // and the four acts drawn whether or not they can run.
  await expect(panel.locator('.metacom-panel .standing .dot')).toBeVisible();
  await expect(panel.locator('.metacom-panel .acts button')).toHaveCount(4);

  await expect(panel).toHaveScreenshot('metacom-panel.png', { mask: dynamic(page) });
});

/*
 * The panel element itself this time, which is the tighter frame and the one to
 * prefer wherever it works: a sentence and a button are short enough to stand
 * inside the sheet's body with room to spare, so every pixel in the shot is
 * this panel's own and nothing else on the dialog can move it.
 */
test('the „Alles löschen" panel, unfolded', async ({ page }) => {
  await openSettings(page);
  const panel = await openPanel(page, 'Alles löschen');

  /* The destructive button is what this panel is: it carries .destructive, and
     that class is one of the ones moving. A panel whose one button had lost its
     colour is exactly the kind of change a behaviour test sails through. */
  await expect(panel.locator('button.destructive')).toBeVisible();

  await expect(panel).toHaveScreenshot('delete-everything-panel.png', {
    mask: dynamic(page),
  });
});
