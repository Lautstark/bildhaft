import { svelte } from '@sveltejs/vite-plugin-svelte';
import { vitestConfig } from '@lautstark/toolchain/vitest';

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
 *
 * The node environment, the restored mocks and the unstubbed globals are
 * @lautstark/toolchain's now; what stays here is which files are this
 * product's suite.
 */
export default vitestConfig({
  include: ['tests/unit/**/*.test.ts'],
  setupFiles: ['./tests/unit/setup.ts'],
}, {
  /* Not because anything here mounts a component — none of these tests touch
     the DOM. It is because they reach modules that reach components:
     print-for.test.ts asks `printFor()` a question about millimetres, and the
     module that answers sits beside the dialog that draws them. Without the
     plugin the import fails on the first `{#snippet}` it meets, which reads as
     a syntax error in a file the test never meant to load. */
  plugins: [svelte()],
});
