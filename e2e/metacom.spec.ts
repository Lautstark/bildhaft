import { expect, test, type Page } from '@playwright/test';
import { mockArasaac } from './arasaac-mock.ts';
import {
  arasaacHeading, chooseFakeFolder, FILES, FOLDER, metacomHeading, openSymbolSettings,
  withoutDirectoryPicker,
} from './metacom-folder.ts';
import { translate } from './helpers.ts';

/**
 * METACOM with a fake symbol folder.
 *
 * The folder, the indexing and the way into the settings panels are
 * metacom-folder.ts' — a second spec needs them, because telling one Sammlung's
 * symbol source from another's takes two sources that draw different pictures.
 * What is left here is what METACOM itself has to do: index a folder, read from
 * it, survive a reload, and say so when it cannot.
 */

test.beforeEach(async ({ page }) => {
  await withoutDirectoryPicker(page);
  await mockArasaac(page);
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
});

/**
 * The step that used to sit between choosing a folder and seeing it used.
 *
 * Every test below chooses a folder and then expects METACOM symbols without
 * pressing anything further, so they all depend on this; it is asserted once
 * here so that a regression names itself instead of surfacing as six tests
 * failing on a missing image.
 *
 * What adopting *means* moved once the source became a property of the
 * Sammlung: it sets the default rather than switching the whole app, and the
 * headings say „Standardquelle" rather than „Aktive Quelle". The Sammlungen
 * that follow the default still move — which is every one of them until
 * somebody says otherwise, and is why the rest of this file is unchanged.
 */
test('a chosen folder becomes the default source on its own', async ({ page }) => {
  await openSymbolSettings(page);
  await expect(metacomHeading(page)).not.toContainText('Standardquelle');
  await expect(arasaacHeading(page)).toContainText('Standardquelle');

  await chooseFakeFolder(page);

  await expect(metacomHeading(page)).toContainText('Standardquelle');
  await expect(arasaacHeading(page)).not.toContainText('Standardquelle');
  // Said out loud, because the rows behind the dialog have just been redrawn.
  await expect(page.locator('.toast')).toContainText('Alle Zeilen werden neu gezeichnet');
});

/**
 * The way in is a control, and the keyboard can work it.
 *
 * This is the one property the shared panel bought that nothing else here would
 * notice losing. bildhaft drew the folder button as `<label class="btn">`
 * wrapping a hidden file input: it looked exactly like a button, it worked
 * under a pointer, and it was not a control — a label has no tab stop and does
 * nothing on Enter. So the way into METACOM was mouse-only, in the product
 * whose whole subject is somebody who cannot use a mouse well.
 * `@lautstark/bildquelle/metacom-panel` uses a real `<button>` that clicks the
 * input, which is what wochenwerk and vorlaut-editor already did.
 *
 * Asserted three ways, because each alone can be true of the broken version:
 * the accessibility tree calls it a button; **Tab** reaches it, walking from the
 * panel's own heading through the licence link, which is the part a label fails;
 * and **Enter** on it forwards a click to the file input, which is the part a
 * `tabindex="0"` bolted onto a label would still fail.
 *
 * `withoutDirectoryPicker` in beforeEach is what puts the file-input arm in
 * play. On a browser that has `showDirectoryPicker` the same button opens the
 * native dialog instead — also from Enter, and also unreachable before.
 */
test('the folder button is a control, and the keyboard can reach and press it', async ({ page }) => {
  await openSymbolSettings(page);
  const panel = page.locator('details.panel', { has: page.locator('.metacom-panel') });

  // The four acts are buttons, not labels dressed as them.
  await expect(panel.locator('.metacom-panel .acts button')).toHaveCount(4);
  const choose = panel.getByRole('button', { name: 'Ordner wählen', exact: true });
  await expect(choose).toBeEnabled();

  /* The click the button owes the hidden input, counted. Prevented, because a
     real one opens a file dialog the test could never close. */
  await page.evaluate(() => {
    const input = [...document.querySelectorAll<HTMLInputElement>('input[type=file]')]
      .find((i) => i.hasAttribute('webkitdirectory'))!;
    Object.assign(window, { picks: 0 });
    input.addEventListener('click', (event) => {
      event.preventDefault();
      (window as unknown as { picks: number }).picks += 1;
    });
  });

  /* From the panel's heading, which is where a reader who just opened this
     section already is. Two stops: the licence link the module added, then the
     button. A label would be neither of them — Tab would arrive somewhere else
     entirely, which is what this walk is really asserting. */
  await panel.locator('summary').focus();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('link')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(choose).toBeFocused();

  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as unknown as { picks: number }).picks)).toBe(1);
});

test('indexes a folder, ignoring anything that is not an image', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);

  // Eight PNGs; the .txt must not be counted.
  await expect(metacomHeading(page)).toContainText('8 Symbole');
  await expect(metacomHeading(page)).toContainText(FOLDER);
});

test('renders a sentence from the folder rather than from ARASAAC', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
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
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');

  // The licensing guarantee, asserted rather than promised: choosing METACOM and
  // rendering from it must not touch any third-party host.
  expect(offSite).toEqual([]);
});

test('says so when the folder is indexed but unreadable', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
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
      .map((rel) => {
        const label = (rel.split('/').pop() ?? rel).replace(/\.png$/, '');
        // The stored slots hold folder-prefixed paths, because that is what the
        // directory pick produced. The index has to speak the same ids or it
        // cannot say whether a failing symbol is one of its own.
        return { path: `${folder}/${rel}`, label, terms: [label.toLowerCase()] };
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
  await expect(metacomHeading(page)).toContainText('8 Symbole');
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  // Ready by its own account, and still unable to produce a single symbol.
  await expect(page.locator('.banner')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.banner')).toContainText('METACOM');
  await expect(page.getByRole('button', { name: 'Zugriff bestätigen' })).toBeVisible();
});

test('symbols come back once the folder can be read again', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');
  await expect(page.locator('.row .slot img')).toHaveCount(3);

  // Take the folder away, exactly as a reload does, and let the symbols give up.
  await page.evaluate(async ({ folder, files }) => {
    const db: IDBDatabase = await new Promise((resolve) => {
      const request = indexedDB.open('bildquelle');
      request.onsuccess = () => resolve(request.result);
    });
    const entries = files
      .filter((f) => f.endsWith('.png'))
      .map((rel) => {
        const label = (rel.split('/').pop() ?? rel).replace(/\.png$/, '');
        // The stored slots hold folder-prefixed paths, because that is what the
        // directory pick produced. The index has to speak the same ids or it
        // cannot say whether a failing symbol is one of its own.
        return { path: `${folder}/${rel}`, label, terms: [label.toLowerCase()] };
      });
    const tx = db.transaction(['metacomIndex', 'metacomHandles'], 'readwrite');
    tx.objectStore('metacomIndex').put({ key: 'metacom', rootName: folder, entries, ts: Date.now() });
    tx.objectStore('metacomHandles').put({ key: 'metacomDir', handle: { name: folder } });
    await new Promise((resolve) => { tx.oncomplete = resolve; });
  }, { folder: FOLDER, files: FILES });

  await page.reload();
  await expect(page.locator('.banner')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.row .slot img')).toHaveCount(0);

  /*
   * Give the folder back. The regression this guards: a symbol that has given up
   * has the same provider and the same id as before, so nothing about it changes
   * when access returns and it stays blank — which made the recovery button look
   * broken even though the permission had been restored.
   */
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  await expect(page.locator('.row .slot img')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('.banner')).toBeHidden();
});

test('a folder that survives a reload just works', async ({ page }) => {
  /*
   * The case the other tests do not cover: a real FileSystemDirectoryHandle,
   * stored and read back after a reload, with real bytes behind it. Origin
   * private storage supplies one without a native dialog — it is not identical
   * to a directory the user picked, since it never needs a permission grant, but
   * it is a genuine handle rather than a stand-in, and it exercises restore(),
   * the persisted index and the file read end to end.
   *
   * Worth having because every other METACOM test here asserts a failure. If
   * restore() or the read path breaks, those keep passing.
   */
  await page.evaluate(async () => {
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    );
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('METACOM_fake', { create: true });
    for (const name of ['Ich.png', 'moechten.png', 'schlafen.png']) {
      const file = await dir.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(png);
      await writable.close();
    }

    const source = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildquelle');
      request.onsuccess = () => resolve(request.result);
    });
    const entries = [
      { path: 'Ich.png', label: 'Ich', terms: ['ich'] },
      { path: 'moechten.png', label: 'moechten', terms: ['moechten', 'möchte', 'mögen'] },
      { path: 'schlafen.png', label: 'schlafen', terms: ['schlafen'] },
    ];
    await new Promise((resolve) => {
      const tx = source.transaction(['metacomIndex', 'metacomHandles'], 'readwrite');
      tx.objectStore('metacomIndex').put({ key: 'metacom', rootName: 'METACOM_fake', entries, ts: Date.now() });
      tx.objectStore('metacomHandles').put({ key: 'metacomDir', handle: dir });
      tx.oncomplete = resolve;
    });

    const app = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    const settings = await new Promise<Record<string, unknown>>((resolve) => {
      const query = app.transaction('settings').objectStore('settings').get('app');
      query.onsuccess = () => resolve(query.result);
    });
    settings.activeProvider = 'metacom';
    await new Promise((resolve) => {
      const tx = app.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(settings, 'app');
      tx.oncomplete = resolve;
    });
  });

  await page.reload();
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  await translate(page, 'Ich möchte schlafen');

  const images = page.locator('.row .slot img');
  await expect(images).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(images.nth(i)).toHaveAttribute('src', /^blob:/);
  }
  // Nothing failed, so nothing should be complaining.
  await expect(page.locator('.banner')).toBeHidden();
  await expect(page.locator('.slot__blank--error')).toHaveCount(0);
});

test('a missing symbol is not reported as an unreadable folder', async ({ page }) => {
  /*
   * A bug I introduced. The warning counts symbols that fail to resolve, and at
   * first it counted all of them — so a sentence built against one folder, shown
   * with another, produced "bildhaft cannot read your folder" about a folder it
   * was reading perfectly well. Anyone reorganising or swapping folders hits it.
   *
   * The sentence is written straight into storage because it has to carry
   * METACOM ids the current folder does not contain, which is precisely the
   * state that a fresh translation would never produce.
   */
  await page.evaluate(async () => {
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    );
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('METACOM_other', { create: true });
    const file = await dir.getFileHandle('Etwas.png', { create: true });
    const writable = await file.createWritable();
    await writable.write(png);
    await writable.close();

    const source = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildquelle');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = source.transaction(['metacomIndex', 'metacomHandles'], 'readwrite');
      tx.objectStore('metacomIndex').put({
        key: 'metacom',
        rootName: 'METACOM_other',
        entries: [{ path: 'Etwas.png', label: 'Etwas', terms: ['etwas'] }],
        ts: Date.now(),
      });
      tx.objectStore('metacomHandles').put({ key: 'metacomDir', handle: dir });
      tx.oncomplete = resolve;
    });

    const app = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    const collectionId = 'c-missing';
    const slot = (id: string, word: string) => ({
      id: `s-${word}`,
      sourceToken: word,
      concept: word.toLowerCase(),
      origin: 'lemma',
      // Paths from some other folder: readable source, absent file.
      choice: { metacom: id },
      candidates: { metacom: [{ id, label: word, score: 100 }] },
    });
    await new Promise((resolve) => {
      const tx = app.transaction(['collections', 'sentences', 'settings'], 'readwrite');
      tx.objectStore('collections').put({
        id: collectionId, name: 'Anderer Ordner', sentenceIds: ['x1'],
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      tx.objectStore('sentences').put({
        id: 'x1',
        normalizedInput: 'ich möchte schlafen',
        rawInput: 'Ich möchte schlafen',
        collectionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        slots: [slot('Alt/Ich.png', 'Ich'), slot('Alt/moechten.png', 'möchte'), slot('Alt/schlafen.png', 'schlafen')],
      });
      const put = tx.objectStore('settings').get('app');
      put.onsuccess = () => {
        const settings = put.result ?? {};
        settings.activeProvider = 'metacom';
        settings.lastCollectionId = collectionId;
        tx.objectStore('settings').put(settings, 'app');
      };
      tx.oncomplete = resolve;
    });
  });

  await page.reload();
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();
  // Long enough for three symbols to fail and the counter to reach its threshold.
  await page.waitForTimeout(6000);

  await expect(page.locator('.row .slot')).toHaveCount(3);
  // Symbols the folder does not have are missing, and missing is not broken.
  await expect(page.locator('.banner')).toBeHidden();
});
test('a sentence still renders after the folder comes back under another name', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');
  await expect(page.locator('.row .slot img')).toHaveCount(3);

  /*
   * The stored slots now hold ids like "METACOM_9_Desktop/Verben/schlafen.png"
   * — paths into the copy of the collection that was indexed when the choice
   * was made. People rename folders, move them to another disk, re-read the
   * same collection on another machine. The paths change; the pictures do
   * not. Reading the same files under a new root must not blank every stored
   * sentence: a missed lookup falls back to bildquelle's name resolution,
   * which matches the path below the root.
   */
  await openSymbolSettings(page);
  await chooseFakeFolder(page, 'METACOM_9_Kopie');
  await expect(metacomHeading(page)).toContainText('METACOM_9_Kopie');
  await page.getByRole('button', { name: 'Dialog schließen' }).click();

  const images = page.locator('.row .slot img');
  await expect(images).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(images.nth(i)).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  }
});

/* ------------------------------------------------------ parallel renderings */

/**
 * METACOM ships the same symbols several times over — with and without a
 * frame, with and without the word printed on the picture — as sibling folders
 * holding identical file names. Identical names score identically, so without a
 * preference the rendering a sentence gets is whichever the index listed first.
 *
 * These two PNGs differ only in size, which is how a test tells one rendering
 * from the other without any licensed artwork existing anywhere.
 */
const MIT_TEXT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const OHNE_TEXT = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAD0lEQVR4nGNg+M8ARVhYAIaXCPjDmz7KAAAAAElFTkSuQmCC';

async function chooseTwoRenderings(page: Page): Promise<void> {
  await page.evaluate(({ mit, ohne }) => {
    const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    for (const [rel, b64] of [
      ['PNG_mit_Text/Personen/Ich.png', mit],
      ['PNG_mit_Text/Verben/moechten.png', mit],
      ['PNG_mit_Text/Essen/Apfel.png', mit],
      ['PNG_mit_Text/Essen/essen.png', mit],
      ['PNG_ohne_Text/Personen/Ich.png', ohne],
      ['PNG_ohne_Text/Verben/moechten.png', ohne],
      ['PNG_ohne_Text/Essen/Apfel.png', ohne],
      ['PNG_ohne_Text/Essen/essen.png', ohne],
    ] as [string, string][]) {
      const file = new File([bytesOf(b64)], rel.split('/').pop()!, { type: 'image/png' });
      Object.defineProperty(file, 'webkitRelativePath', { value: `METACOM_9/${rel}` });
      transfer.items.add(file);
    }
    const input = [...document.querySelectorAll<HTMLInputElement>('input[type=file]')]
      .find((i) => i.hasAttribute('webkitdirectory'))!;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { mit: MIT_TEXT, ohne: OHNE_TEXT });
}

/** Every symbol in the first row, by the width that identifies its rendering. */
async function renderingWidths(page: Page): Promise<number[]> {
  return page.locator('.row').first().locator('.slot img')
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
}

test('prefers one rendering, and brings existing rows with it', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseTwoRenderings(page);

  await page.getByLabel('Darstellung').selectOption('PNG_ohne_Text');
  await page.getByLabel('Dialog schließen').click();

  await translate(page, 'Ich möchte einen Apfel essen');
  await expect.poll(() => renderingWidths(page)).toEqual([3, 3, 3, 3]);

  // Switching afterwards has to move the rows that already exist, not just the
  // next sentence — every slot holds the right symbol in the wrong rendering.
  await openSymbolSettings(page);
  await page.getByLabel('Darstellung').selectOption('PNG_mit_Text');
  await page.getByLabel('Dialog schließen').click();
  await expect.poll(() => renderingWidths(page), { timeout: 10000 }).toEqual([1, 1, 1, 1]);
});

test('applies the remembered rendering before the first symbol resolves', async ({ page }) => {
  /*
   * The preference is only worth anything if it survives a reload, and the
   * moment it has to be in place is before any slot is filled — a sentence
   * translated ahead of it would be filled from the wrong rendering and stay
   * that way. A real handle out of origin private storage is the only way to
   * have a folder still there after a reload, as above.
   *
   * The index lists the "mit Text" copy first, so that is what an unset
   * preference produces. Asking for the other one is therefore decisive.
   */
  await page.evaluate(async ({ mit, ohne }) => {
    const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('METACOM_renderings', { create: true });
    for (const [folder, b64] of [['PNG_mit_Text', mit], ['PNG_ohne_Text', ohne]] as [string, string][]) {
      const sub = await dir.getDirectoryHandle(folder, { create: true });
      const file = await sub.getFileHandle('Apfel.png', { create: true });
      const writable = await file.createWritable();
      await writable.write(bytesOf(b64));
      await writable.close();
    }

    const source = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildquelle');
      request.onsuccess = () => resolve(request.result);
    });
    const entries = [
      { path: 'PNG_mit_Text/Apfel.png', label: 'Apfel', terms: ['apfel'] },
      { path: 'PNG_ohne_Text/Apfel.png', label: 'Apfel', terms: ['apfel'] },
    ];
    await new Promise((resolve) => {
      const tx = source.transaction(['metacomIndex', 'metacomHandles'], 'readwrite');
      tx.objectStore('metacomIndex').put({ key: 'metacom', rootName: 'METACOM_renderings', entries, ts: Date.now() });
      tx.objectStore('metacomHandles').put({ key: 'metacomDir', handle: dir });
      tx.oncomplete = resolve;
    });

    const app = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('bildhaft');
      request.onsuccess = () => resolve(request.result);
    });
    const settings = await new Promise<Record<string, unknown>>((resolve) => {
      const query = app.transaction('settings').objectStore('settings').get('app');
      query.onsuccess = () => resolve(query.result);
    });
    settings.activeProvider = 'metacom';
    settings.metacomRendering = 'PNG_ohne_Text';
    await new Promise((resolve) => {
      const tx = app.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(settings, 'app');
      tx.oncomplete = resolve;
    });
  }, { mit: MIT_TEXT, ohne: OHNE_TEXT });

  await page.reload();
  await translate(page, 'Apfel');
  await expect.poll(() => renderingWidths(page)).toEqual([3]);
});

test('the copyright notice is offered for METACOM, and only on request', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await expect(page.locator('.preview-frame .ps-sheet')).toBeVisible();

  // Nothing is claimed on the user's behalf: printing from a licence you own
  // carries no obligation, so the foot of the sheet stays empty until asked.
  await expect(page.locator('#print-root .ps-attribution')).toHaveCount(0);

  await page.getByLabel('Copyright-Hinweis drucken').check();
  await expect(page.locator('#print-root .ps-attribution'))
    .toContainText('METACOM Symbole © Annette Kitzinger');
  // ARASAAC's credit has no business on a sheet of METACOM symbols.
  await expect(page.locator('#print-root .ps-attribution')).not.toContainText('ARASAAC');
});

test('a credit line does not push itself onto a page of its own', async ({ page }) => {
  await openSymbolSettings(page);
  await chooseFakeFolder(page);
  await page.getByRole('button', { name: 'Dialog schließen' }).click();
  await translate(page, 'Ich möchte schlafen');

  await page.getByRole('button', { name: 'Drucken', exact: true }).click();
  await page.getByRole('button', { name: 'Kartenblatt' }).click();
  await page.getByRole('button', { name: 'Raster' }).click();
  /*
   * One card per page, so the last page is full whatever the sentence yielded.
   * A part-filled page is shorter than the paper and would prove nothing — only
   * a full one reaches the edge the notice has to fit above.
   */
  await page.getByRole('spinbutton', { name: 'Spalten' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Zeilen' }).fill('1');
  await page.getByLabel('Copyright-Hinweis drucken').check();

  /*
   * Asked of the last page box rather than measured off the sheet in
   * millimetres. The notice is pinned to the foot of its page, so the distance
   * from the grid down to it is the page height by construction and says
   * nothing; what the reservation is for is that the notice shares that page
   * with a card instead of taking a sheet for itself.
   */
  const seen = await page.locator('.preview-frame .ps-sheet').evaluate((sheet: HTMLElement) => {
    const pages = [...sheet.querySelectorAll<HTMLElement>('.ps-page')];
    const last = pages[pages.length - 1]!;
    return {
      creditOnLast: !!last.querySelector('.ps-attribution'),
      cardsOnLast: last.querySelectorAll('.ps-card').length,
      spill: last.scrollHeight - last.clientHeight,
    };
  });
  expect(seen.creditOnLast).toBe(true);
  expect(seen.cardsOnLast).toBeGreaterThan(0);
  expect(seen.spill).toBe(0);
});
