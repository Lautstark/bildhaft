import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import { translate } from './helpers.ts';

/**
 * METACOM with a fake symbol folder.
 *
 * The point is not the licensed artwork — it is that bildhaft must never ship or
 * fetch any — but the machinery around it: filenames become an index, the index
 * answers lookups, and the images are read from the user's own disk. A handful
 * of invented PNGs named the way METACOM names its files exercises all of it.
 *
 * The directory picker cannot be driven from a test because it opens a native
 * dialog, so this uses the `<input webkitdirectory>` path, which is the same
 * indexing and reading code with a different source.
 */

/** A 1x1 PNG. Enough for naturalWidth > 0. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Named the way METACOM does: word, underscores, trailing variant numbers. */
const FOLDER = 'METACOM_9_Desktop';
const FILES = [
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

async function chooseFakeFolder(page: Page): Promise<void> {
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
    { folder: FOLDER, files: FILES, b64: PNG_BASE64 },
  );
}

async function openSymbolSettings(page: Page): Promise<void> {
  // The sidebar starts collapsed, so its Einstellungen button is hidden.
  const reveal = page.getByRole('button', { name: 'Seitenleiste einblenden' });
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
  // The banner offers an Einstellungen button too, so scope this to the sidebar.
  await page.getByRole('complementary').getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Symbole' }).click();
}

test.beforeEach(async ({ page }) => {
  /*
   * Hide the directory picker so the app offers the <input webkitdirectory>
   * fallback instead. That is the real Firefox and Safari path, and it is the
   * only one a test can drive: showDirectoryPicker opens a native dialog.
   */
  await page.addInitScript(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

test('indexes a folder, ignoring anything that is not an image', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);

  // Eight PNGs; the .txt must not be counted.
  await expect(page.locator('.card', { hasText: 'METACOM' })).toContainText('8 Symbole');
  await expect(page.locator('.card', { hasText: 'METACOM' })).toContainText(FOLDER);
});

test('renders a sentence from the folder rather than from ARASAAC', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Verwenden' }).click();
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  await translate(page, 'Ich möchte schlafen');

  await expect(page.locator('.row').first().locator('.slot__label'))
    .toHaveText(['Ich', 'möchte', 'schlafen']);

  const images = page.locator('.row .slot img');
  await expect(images).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    // A blob: URL means the bytes came off the local folder, not the network.
    await expect(images.nth(i)).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }
});

test('never requests a METACOM file over the network', async ({ page }) => {
  const offSite: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith('http://localhost') && !url.startsWith('blob:') && !url.startsWith('data:')) {
      offSite.push(url);
    }
  });

  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Verwenden' }).click();
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');

  // The licensing guarantee, asserted rather than promised: choosing METACOM and
  // rendering from it must not touch any third-party host.
  expect(offSite).toEqual([]);
});

test('says so when the folder is indexed but unreadable', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Verwenden' }).click();
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');
  await expect(page.locator('.row .slot img').first()).toBeVisible();

  /*
   * The regression this exists for, reproduced exactly: after a reload the
   * cached index and the stored folder handle both come back, so METACOM
   * reports itself ready and settings shows a symbol count — while every file
   * read is refused. Standing in for a handle whose permission has lapsed is a
   * plain object: it survives structured cloning, reports no permission API so
   * the check passes, and throws the moment anything tries to read through it.
   *
   * Before the fix this left the app looking healthy with every symbol blank,
   * which is indistinguishable from the work having been lost.
   */
  await page.evaluate(async ({ folder, files }) => {
    const db: IDBDatabase = await new Promise((resolve) => {
      const request = indexedDB.open('bildquelle');
      request.onsuccess = () => resolve(request.result);
    });
    const entries = files
      .filter((f) => f.endsWith('.png'))
      .map((path) => {
        const label = (path.split('/').pop() ?? path).replace(/\.png$/, '');
        return { path, label, terms: [label.toLowerCase()] };
      });
    const tx = db.transaction(['metacomIndex', 'metacomHandles'], 'readwrite');
    tx.objectStore('metacomIndex').put({ key: 'metacom', rootName: folder, entries, ts: Date.now() });
    tx.objectStore('metacomHandles').put({ key: 'metacomDir', handle: { name: folder } });
    await new Promise((resolve) => { tx.oncomplete = resolve; });
  }, { folder: FOLDER, files: FILES });

  await page.reload();
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();

  /*
   * Wait for the source to finish claiming it is fine before judging the banner.
   * Restoring is asynchronous, so a banner seen too early only proves the app
   * had not started yet — which is what an earlier version of this test proved.
   * The symbol count appearing in settings is the point where METACOM has
   * adopted the cached index and reports itself ready.
   */
  await openSymbolSettings(page);
  await expect(page.locator('.card', { hasText: 'METACOM' })).toContainText('8 Symbole');
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  // Ready by its own account, and still unable to produce a single symbol.
  await expect(page.locator('.banner')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.banner')).toContainText('METACOM');
  await expect(page.getByRole('button', { name: 'Zugriff bestätigen' })).toBeVisible();
});
