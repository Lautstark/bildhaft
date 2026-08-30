import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/*
 * bildhaft's privacy notice makes a short, checkable claim: the page comes from
 * GitHub Pages, a single word goes to ARASAAC when a pictogram is looked up,
 * and nothing else leaves the browser - your sentences and your METACOM folder
 * least of all.
 *
 * Nothing in the build enforces that. A dependency that fetches from a CDN of
 * its own, a font pulled from somebody else's server, an analytics snippet
 * added in a hurry: none of them fail a test, none of them look wrong in a
 * diff, and each of them makes the notice untrue. Untrue is the one kind of
 * wrong here that is a legal defect rather than a bug, which is why this reads
 * the built bundle rather than trusting review to notice.
 *
 * The question asked is which hosts the built site names at all - not which it
 * fetches, because from the outside those cannot be told apart. So the list
 * below carries both kinds, and says which is which. A host that is not on it
 * fails. If you are here because of a host you just introduced: work out
 * whether anything is fetched from it, and if it is, it belongs in the privacy
 * notice before it belongs in this file.
 *
 * The sister check is mitreden's e2e/offline.spec.ts. It carries a piece this
 * one does not need - mitreden rewrites two hardcoded CDNs out of a speech
 * package at build time, and has to prove the rewrite happened. bildhaft has
 * no such dependency, so here the sweep is the whole of it.
 */

const DIST = resolve(process.cwd(), 'dist');

/** Files worth reading. Images and archives are not text. */
const TEXT = new Set(['.js', '.css', '.html', '.json', '.webmanifest', '.map']);

/**
 * Every host the built site is allowed to name, and why. "Fetched" is the
 * column that matters: those are the ones the privacy notice has to declare.
 */
const ALLOWED = new Map([
  // Fetched. The pictogram search and the pictures it returns. Declared.
  ['api.arasaac.org', 'the pictogram search'],
  ['static.arasaac.org', 'the pictogram images'],
  // Fetched, and only ever after a ?sammlung= link is opened: the one published
  // Sammlung that link names. Declared — „Eine fertige Sammlung holen".
  ['lautstark.tech', 'a published Sammlung a ?sammlung= link names'],
  // Linked in prose, never fetched - the about, Impressum and privacy texts.
  // bildhaft's own address is among them: it is printed at the foot of a sheet
  // so that paper says where it came from, and nothing ever asks it for anything.
  ['bildhaft.lautstark.tech', 'this page, named in the printed credit line'],
  ['arasaac.org', 'the attribution the licence requires'],
  ['github.com', 'the source code and the issue tracker'],
  ['lautstark.github.io', 'the sister projects'],
  // Never fetched and never linked: strings that travel inside third-party
  // code - jszip names its own home in its licence header.
  ['stuk.github.io', "jszip's documentation, in its banner"],
  ['raw.github.com', "jszip's licence, in its banner"],
  ['stuartk.com', "jszip's author, in its banner"],
  ['www.w3.org', 'the SVG and XML namespaces'],
]);

/**
 * Hosts that would mean a dependency has started fetching its own code at
 * runtime. Named separately from the sweep below only for the error message:
 * "a package CDN is in the bundle" wants a different first move from "here is
 * a host nobody has classified".
 */
const PACKAGE_CDNS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'esm.sh', 'cdn.skypack.dev'];

const HOST = /https?:\/\/([a-zA-Z0-9.-]+)/g;

/** Every text file under dist/, however deep. */
function builtFiles(dir = DIST): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...builtFiles(full));
    else if (TEXT.has(extname(entry))) out.push(full);
  }
  return out;
}

/** Which hosts each file names, as host -> the files naming it. */
function hostsInBuild(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of builtFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const [, host] of text.matchAll(HOST)) {
      const where = found.get(host) ?? [];
      if (!where.includes(file)) where.push(file);
      found.set(host, where);
    }
  }
  return found;
}

test.describe('the built bundle', () => {
  test('has been built at all', () => {
    // Without this the two below pass on an empty directory, which is the
    // worst way for a check like this to be green.
    const files = builtFiles();
    expect(files.length, `no built files under ${DIST} - run npm run build`).toBeGreaterThan(2);
    expect(files.some((f) => f.endsWith('index.html'))).toBe(true);
    expect(files.some((f) => f.endsWith('.js'))).toBe(true);
  });

  test('names no package CDN', () => {
    const hosts = hostsInBuild();
    const cdns = PACKAGE_CDNS.filter((cdn) => hosts.has(cdn));
    expect(cdns, cdns.length
      ? `${cdns.join(', ')} is named in the bundle: something is being fetched from a `
        + 'package CDN at runtime, which is a third party the privacy notice does not name'
      : '').toEqual([]);
  });

  test('names no host it has not been told about', () => {
    const hosts = hostsInBuild();
    const strangers = [...hosts.keys()].filter((host) => !ALLOWED.has(host)).sort();
    expect(strangers, strangers.length
      ? 'the built site names ' + strangers.map((h) => `${h} (in ${hosts.get(h)!.join(', ')})`).join('; ')
        + ' - if anything is fetched from it, the privacy notice has to say so; '
        + 'then add it to ALLOWED in this file with the reason'
      : '').toEqual([]);
  });
});

test('opening the page reaches nothing but this origin', async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!/^https?:/.test(url)) return;             // data:, blob: - not the network
    if (!url.startsWith(baseURL!)) outside.push(url);
  });

  // Deliberately without the ARASAAC mock the other specs install: the point
  // is what a real first visit costs somebody, and the answer has to be
  // nothing. ARASAAC is reached when a pictogram is looked up, not on arrival.
  await page.goto('/');
  await expect(page.getByLabel('Satz eingeben')).toBeVisible();

  expect(outside, outside.join('\n')).toEqual([]);
});
