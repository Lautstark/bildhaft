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

export async function chooseFakeFolder(page: Page, folder: string = FOLDER): Promise<void> {
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
    { folder, files: FILES, b64: PNG_BASE64 },
  );
}

/** Einstellungen, from the sidebar rather than from a banner that offers it too. */
export async function openAppSettings(page: Page): Promise<void> {
  // The sidebar starts collapsed, so its Einstellungen button is hidden.
  const reveal = page.getByRole('button', { name: 'Seitenleiste einblenden' });
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  await page.getByRole('complementary').getByRole('button', { name: 'Einstellungen' }).click();
}

export async function openSymbolSettings(page: Page): Promise<void> {
  await openAppSettings(page);
  // Each source is a folded panel; its controls are inside its own body, so a
  // test that drives them has to open it exactly as a person would.
  await metacomHeading(page).click();
}

/**
 * The METACOM panel's heading. Scoped to the summary rather than the panel
 * because the dictionary panel names the provider in force in its body too —
 * and because the state belongs to the heading now, which is the whole point of
 * it: those assertions pass without opening anything.
 */
export function metacomHeading(page: Page) {
  return page.locator('.panel > summary').filter({ hasText: 'METACOM' });
}

/** Its counterpart, for the assertion that only one source is the default. */
export function arasaacHeading(page: Page) {
  return page.locator('.panel > summary').filter({ hasText: 'ARASAAC' });
}
