import { defineConfig, devices } from '@playwright/test';

/* A port of bildhaft's own, and E2E_PORT to move it.
 *
 * 4173 is vite preview's default, so it was also mitreden's - and with
 * reuseExistingServer, whichever suite starts second finds a server already
 * answering and quietly tests the *other product's* app. Measured, not
 * supposed: mitreden's "opens with one Sammlung" run against a bildhaft
 * preview times out waiting for `#rows .list__item`, which reads as a bug in
 * mitreden's own list. The failure never mentions the port.
 *
 * E2E_PORT still moves it, which is what two checkouts of *this* repo need -
 * a worktree running the suite beside another one has the same problem one
 * level down.
 */
const PORT = Number(process.env.E2E_PORT ?? 4174);

/**
 * The suite runs against the real production bundle, not the dev server, so a
 * build-only breakage cannot slip through to Pages. `npm run test:e2e` builds
 * first; the CI workflow gates deployment on this passing.
 *
 * ## Why this is written out rather than `@lautstark/toolchain/playwright`
 *
 * bildhaft takes its tsconfig and its vitest base from the toolchain, and this
 * one is the exception, held with the Playwright version beside it in
 * package.json. The toolchain is on Playwright ^1.63, which ships Chromium
 * 1243; on that browser the renderer dies while `metacom.restore()` reads a
 * stored `FileSystemDirectoryHandle` back out of IndexedDB, which takes three
 * METACOM cases down with it. It is the browser and not this app: main's own
 * build crashes identically once its Playwright is bumped to 1.63.
 *
 * The visual baselines beside e2e/visual.spec.ts are the other half. They were
 * recorded against the browser 1.62 ships, at a tolerance of zero, so the
 * version cannot move without re-recording them. Both halves want the same
 * thing: one deliberate change that moves the browser and the pictures
 * together, which is not this one. adr/0003.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    /*
     * The language, pinned for the whole suite.
     *
     * bildhaft picks its language from the browser when nobody has chosen one,
     * so without this the assertions quoting a sentence would pass on a German
     * laptop and fail on an English runner - and the failure would read as a
     * broken feature rather than as a locale. Every existing spec is written in
     * German, so German it is; language.spec.ts is the one that switches away
     * from it, which is the only way to test a switch.
     */
    locale: 'de-DE',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],

  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
