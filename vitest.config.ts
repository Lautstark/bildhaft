import { defineConfig } from 'vitest/config';

/*
 * The checks that need no browser.
 *
 * bildhaft's suite has been Playwright-only until now, and for a page whose
 * whole behaviour is in the DOM that was the right call. What arrived with the
 * standing backup is a different kind of check: what gets handed to a folder
 * that may sit inside Dropbox, and whether every write to the library still
 * reaches the notifier that triggers one. Neither is visible from the outside —
 * an e2e can watch a file appear but not assert what may never be in it — and
 * both are licensing checks rather than feature tests.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/unit/setup.ts'],
  },
});
