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
 * level down. */
const PORT = Number(process.env.E2E_PORT ?? 4174);

/**
 * The suite runs against the real production bundle, not the dev server, so a
 * build-only breakage cannot slip through to Pages. `npm run test:e2e` builds
 * first; the CI workflow gates deployment on this passing.
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
