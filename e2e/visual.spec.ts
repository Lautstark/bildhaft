import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/* Only the section at the foot of this file needs it: those are the tests that
   put a row on the page, and a row means a symbol lookup. The settings shots
   above never translate anything. */
import { mockArasaac } from './arasaac-mock.ts';

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
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  return page.locator('dialog.sheet');
}

/** Opens one folded panel by its heading and answers the panel itself. */
async function openPanel(page: Page, heading: string): Promise<Locator> {
  const panel = page.locator('dialog.sheet details.panel', { hasText: heading });
  await panel.locator('> summary').click();
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
 *   „Deine Daten" · .state       the panel's headline: „im Ordner „X"". A
 *                                folder somebody picked. This is the one the
 *                                `mask` option is really for.
 *
 *   Symbole · .state             „METACOM · 9.214 Symbole" once a licensed
 *                                folder is read on whichever machine is
 *                                running this. Nobody else's symbol count
 *                                belongs in a committed picture.
 *
 *   .where-panel .standing       The standing backup's line inside the panel:
 *                                a folder and an age that differs between two
 *                                runs a minute apart. `data-state` decides that
 *                                line's colour and is not masked: the mask
 *                                covers the text, the box keeps whatever the
 *                                stylesheet gives it.
 *
 * The other three headings — Sprache & Aussehen, Stimme, Wörter ohne Bild —
 * are left in the picture on purpose. Their state lines are the page's own
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
 * first version of this file put a pink bar through a neighbouring panel's shot.
 */
function dynamic(page: Page): Locator[] {
  return [
    stateOf(page, 'Deine Daten'),
    stateOf(page, 'Symbole'),
    page.locator('dialog.sheet .panel[open] .where-panel .standing'),
  ];
}

test('the settings sheet, as it opens', async ({ page }) => {
  const sheet = await openSettings(page);

  /* No panel is touched first: which one is open on arrival is a decision — see
     settingsDialog.ts on why it is Sprache — and a column of headings with
     exactly one of them unfolded is what this shot is of. */
  // Nine since the Anybook codes brought Stimme and Azure Speech; eight since
  // „Alles löschen" moved into the ⋯ of „Deine Daten"; five since Sprache and
  // Erscheinungsbild, ARASAAC and METACOM, and Stimme and Azure became one
  // panel each (2026-10-31).
  await expect(sheet.locator('details.panel')).toHaveCount(5);
  await expect(sheet).toHaveScreenshot('settings-sheet.png', { mask: dynamic(page) });
});

/*
 * „Deine Daten", @lautstark/sicherung's DatenPanel: the box that says where the
 * work is, the one button under it, the folded „Warum?" — and, in the second
 * frame, the ⋯ menu open, which holds everything else including „Alles
 * löschen" in red. Every class in it (.where-panel, .where, .dot, .menu-anchor,
 * .menu, .menu__note, .where-why) is a package's name for a rule in
 * components.css, so this is where a moved rule shows.
 *
 * The element, not the sheet: short enough now to stand inside the body. The
 * menu is absolutely positioned and hangs out of the panel's box, so the
 * second frame is the sheet, scrolled to the panel.
 */
test('the „Deine Daten" panel, unfolded', async ({ page }) => {
  const sheet = await openSettings(page);
  const panel = await openPanel(page, 'Deine Daten');

  /* A first visit: only in this browser, one button to choose a folder. */
  await expect(panel.locator('.where-panel .where')).toBeVisible();
  await expect(panel.locator('.where-panel .acts button')).toHaveText(['Ordner wählen …']);
  await expect(panel).toHaveScreenshot('data-panel.png', { mask: dynamic(page) });

  await panel.getByRole('button', { name: 'Mehr' }).click();
  const menu = panel.getByRole('menu');
  await expect(menu.getByRole('menuitem').last()).toHaveClass('danger');
  await menu.scrollIntoViewIfNeeded();
  /* Not `dynamic()`: the menu opens upward over the headings, and the mask on
     „Deine Daten"'s own heading would be laid across „Alles löschen", the one
     row whose colour this frame is for. A fresh context has no folder, so that
     heading says „nur in diesem Browser" on every machine. */
  await expect(sheet).toHaveScreenshot('data-panel-menu.png', { mask: [stateOf(page, 'Symbole')] });
});

/*
 * „Symbole", @lautstark/bildquelle's SymbolePanel: ARASAAC as a chosen radio
 * card, and METACOM as a grey card with no radio, unfolded the way „Einrichten
 * …" unfolds it — one sentence, „Ordner wählen …" and the licence link. Every
 * class in it (.answers, .answer, .answer.off, .answer__tag, .answer__more,
 * .acts) is a package's name for a rule in components.css, which is what this
 * file is for: a package's DOM drawn by a second package's stylesheet is only
 * checked where somebody photographs it.
 *
 * It replaced „the METACOM panel, unfolded", which photographed
 * `.metacom-panel` for the same reason.
 *
 * Unfolded rather than as it opens, because the unfolded card holds every rule
 * the folded one does and three more. No METACOM byte is in it: a fresh context
 * has no folder, so the card is words and a button.
 */
test('the Symbole panel, setting up METACOM', async ({ page }) => {
  await openSettings(page);
  const panel = await openPanel(page, 'Symbole');

  /* The cards are really there before anything is taken, so this fails loudly
     if the package ever stops emitting them rather than photographing an empty
     panel and holding every later run to that. */
  await expect(panel.locator('.answer')).toHaveCount(2);
  await expect(panel.locator('.answer.off')).toContainText('METACOM');
  await panel.getByRole('button', { name: 'Einrichten …' }).click();
  await expect(panel.getByRole('button', { name: 'Ordner wählen …' })).toBeFocused();

  await expect(panel).toHaveScreenshot('symbole-panel.png', { mask: dynamic(page) });
});

/*
 * „Stimme": the voices and, under them, „Stimmen von Microsoft Azure" as a
 * `.where` box with its one button — stimmquelle's AzureConnection. A fresh
 * context has no key, so the box says „nicht verbunden" on every machine. The
 * voice list is the browser's and differs between the two runners, so it is
 * the box alone that is photographed.
 */
test('the Azure connection, not connected', async ({ page }) => {
  await openSettings(page);
  const panel = await openPanel(page, 'Stimme');
  const box = panel.locator('#azure');
  await expect(box.locator('.where')).toContainText('nicht verbunden');
  await expect(box.locator('.acts button')).toHaveText(['Verbinden …']);
  await expect(box).toHaveScreenshot('azure-connection.png');
});

/* ==========================================================================
 *
 * The surfaces app.css drew alone, and nothing photographed.
 *
 * Everything above is the settings dialog, because that is what the CSS move of
 * 2026-09-14 was about. These four are here for the pass after it, which went
 * through the seven rules `node node_modules/@lautstark/design/shadows.js`
 * reported and asked of each one whether it was still drawing anything.
 *
 * Four of them turned out to be real and kept — `.title-input`, `.sheet > .body`,
 * `.toast` and `.words .empty` — each adding a declaration or two that
 * components.css does not have. `.sheet > .body` is in every shot above. The
 * other three were on no baseline at all, which is the condition this whole file
 * exists to complain about: a rule nobody photographs can be deleted, or can
 * quietly stop applying, and the suite stays green either way. The reasoning
 * moved into app.css beside each rule; the pictures are here.
 *
 * The file's subject is therefore wider than its header says: it was "the
 * settings surfaces", and it is now "the surfaces whose drawing this product
 * still owns". The guard, the viewport and the snapshot directory are shared
 * with the four above deliberately — `.github/workflows/baselines.yml` records
 * `e2e/visual.spec.ts` and hands back `visual.spec.ts-snapshots/*-linux.png`, so
 * a second file would have been a second thing to wire up and remember.
 * ========================================================================== */

/** A Sammlung with one row in it, named so that no date reaches a picture. */
async function oneRow(page: Page, name: string): Promise<void> {
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  const input = page.getByLabel('Satz eingeben');
  await input.fill('Ich möchte schlafen');
  await input.press('Enter');
  await expect(page.locator('.row')).toHaveCount(1);

  /* „Sammlung vom {date}" is what a new one is called, and a date in a
     committed picture is a picture that goes stale overnight. Renamed to a
     fixed string, then blurred, so no caret is in the frame either. */
  const title = page.locator('.title-input');
  await title.fill(name);
  await title.blur();
}

/*
 * The toast, which is the reason this section exists.
 *
 * It is `position: fixed` at the foot of the screen, it carries a message for
 * 3.2 seconds and then empties itself, and it is on no other baseline in this
 * repository — announce.spec.ts asserts that it is a live region and that it
 * measures 0x0 while empty, which are the two properties that have nothing to
 * do with how it looks. app.css places it; components.css draws the pill. This
 * is the only picture of either.
 *
 * The export is the path announce.spec.ts uses to make one, and „Sammlung
 * exportiert." is a constant in the bundle rather than anything about the
 * machine, so the words are in the picture rather than masked.
 */
test('the toast, carrying a message', async ({ page }) => {
  await oneRow(page, 'Am Morgen');

  await page.getByRole('button', { name: 'Aktionen für dieses Material' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Material exportieren' }).click();
  await download;

  const toast = page.locator('.toast');
  await expect(toast).toHaveText('Material exportiert.');
  await expect(toast).toHaveScreenshot('toast.png');
});

/*
 * The footer, whose rule is now `footer.footer`.
 *
 * A licence obligation — the ARASAAC attribution is why this element exists at
 * all — drawn by components.css for its type, colour and centring and by
 * app.css for the 840px column it stands in. Nothing had ever looked at it.
 */
test('the page footer', async ({ page }) => {
  /* Tall enough that the footer is on screen without scrolling. Scrolled to,
     it lands wherever the scroll stopped, which is a fraction of a pixel. */
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 1400 });
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  const footer = page.locator('footer.footer');
  await expect(footer).toBeVisible();
  /* And onto a whole pixel. Where the footer lands is whatever the empty
     Sammlung above it adds up to, and that is fractional: the fifth template
     tile put it at 937.64px, and Linux then rounded the capture to 71 rows on
     one run and 72 on the next — a red run about the tiles, in a test that
     watches the footer. The nudge is under a pixel and changes nothing in it. */
  await footer.evaluate((node) => {
    const off = node.getBoundingClientRect().top % 1;
    if (off) node.style.marginTop = `calc(${getComputedStyle(node).marginTop} + ${1 - off}px)`;
  });
  await expect(footer).toHaveScreenshot('footer.png');
});

/*
 * The Wortschatz with nothing in it: components.css's taught empty state —
 * dashed box, 34px of padding, a bold line and a small one — plus the one
 * declaration app.css adds, `grid-column: 1 / -1`, which is what makes it span
 * the wall instead of standing in the grid's first cell at one card's width.
 * The shot is of `.words` rather than the box, because the span is the point
 * and a picture of the box alone could not show it.
 */
test('the Wortschatz, empty', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  // Folded while a Material is showing: only what holds the open thing is open.
  await page.getByRole('button', { name: 'Wortschatz' }).click();
  await page.locator('button.collections__item')
    .filter({ hasText: 'Alle Wörter' }).first().click();

  const wall = page.locator('.words');
  await expect(wall.locator('.empty')).toBeVisible();
  await expect(wall).toHaveScreenshot('wortschatz-empty.png');
});

/*
 * The head of an open Sammlung, for `.title-input`.
 *
 * The field that does not look like one until it is asked to: components.css
 * draws its type, its padding and the border that appears on hover, and app.css
 * pulls it 8px left so the name sits over the rows below it rather than indented
 * from them, and tightens its tracking. Neither declaration is visible in any
 * assertion — rowname.spec.ts is about what renaming writes, not where the text
 * sits — so an 8px shift was a thing this suite could not have noticed.
 */
test('the head of a Sammlung', async ({ page }) => {
  await oneRow(page, 'Am Morgen');
  const head = page.locator('.collection-head');
  await expect(head.locator('.title-input')).toHaveValue('Am Morgen');
  await expect(head).toHaveScreenshot('collection-head.png');
});
