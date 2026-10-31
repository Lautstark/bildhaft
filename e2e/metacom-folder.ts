import { type Page } from '@playwright/test';

/**
 * A fake METACOM folder, and the way into the settings panels that read one.
 *
 * The point is not the licensed artwork — bildhaft must never ship or fetch any
 * — but the machinery around it: filenames become an index, the index answers
 * lookups, and the images are read from the user's own disk. A handful of
 * invented PNGs named the way METACOM names its files exercises all of it.
 *
 * The directory picker cannot be driven from a test because it opens a native
 * dialog, so this uses the `<input webkitdirectory>` path, which is the same
 * indexing and reading code with a different source. Tests that use it hide
 * `showDirectoryPicker` on the window so the app offers that input.
 *
 * It lives here rather than in metacom.spec.ts because a second spec needs it:
 * telling one Sammlung's symbol source from another's takes two sources that
 * draw visibly different pictures, and this is where the second one comes from.
 */

/** A 1x1 PNG. Enough for naturalWidth > 0. */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Named the way METACOM does: word, underscores, trailing variant numbers. */
export const FOLDER = 'METACOM_9_Desktop';
export const FILES = [
  'Essen/Apfel.png',
  'Essen/Apfel-02.png',
  'Essen/essen.png',
  'Personen/Ich.png',
  'Verben/moechten.png',
  'Verben/schlafen.png',
  'Tiere/Hund.png',
  'Moebel/Tisch.png',
  'Liesmich.txt', // not an image; must be ignored by the index
];

/** Hides the native directory picker, so the app offers the input a test can drive. */
export async function withoutDirectoryPicker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
}

export async function chooseFakeFolder(
  page: Page, folder: string = FOLDER, files: string[] = FILES,
): Promise<void> {
  await page.evaluate(
    ({ folder, files, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      for (const rel of files) {
        const file = new File([bytes], rel.split('/').pop()!, { type: 'image/png' });
        // The browser sets this on a real directory pick; the provider reads it
        // to learn the path, so a fake pick has to provide it too.
        Object.defineProperty(file, 'webkitRelativePath', { value: `${folder}/${rel}` });
        transfer.items.add(file);
      }
      const input = [...document.querySelectorAll<HTMLInputElement>('input[type=file]')]
        .find((i) => i.hasAttribute('webkitdirectory'))!;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { folder, files, b64: PNG_BASE64 },
  );
}

/** Einstellungen, from the sidebar rather than from a banner that offers it too. */
export async function openAppSettings(page: Page): Promise<void> {
  await page.getByRole('complementary').getByRole('button', { name: 'Einstellungen' }).click();
}

export async function openSymbolSettings(page: Page): Promise<void> {
  await openAppSettings(page);
  // „Symbole" is a folded panel; the two cards are inside its body, so a test
  // that drives them has to open it exactly as a person would.
  await symbolsHeading(page).click();
}

/**
 * The Symbole panel's heading, which says which pictures are in force:
 * „ARASAAC", or „METACOM · 8 Symbole" once a folder is read and chosen. Scoped
 * to the summary, so the assertion passes without opening anything.
 */
export function symbolsHeading(page: Page) {
  return page.locator('.panel > summary').filter({ hasText: 'Symbole' });
}

/** The METACOM card in that panel: a radio once a folder is read, a grey card
 *  with „Einrichten …" until then. */
export function metacomCard(page: Page) {
  return page.locator('.answer').filter({ hasText: 'METACOM' });
}

/** Its counterpart, which is always a radio. */
export function arasaacCard(page: Page) {
  return page.locator('.answer').filter({ hasText: 'ARASAAC' });
}
