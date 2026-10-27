import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { piperVendor } from '@lautstark/stimmquelle/vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// GitHub Pages serves project sites from /<repo>/. Set BASE_PATH in CI.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    /* What the Anybook export speaks with: piper's phonemizer and onnxruntime,
       served from this origin (dist/wasm/, in dev out of node_modules) — the
       same four files and the same directory as mitreden's, so a voice sounds
       the same from both. Fetched only when a code is first recorded. */
    piperVendor({ dir: 'wasm' }),
    {
      // GitHub Pages has no rewrite rules. Serving the SPA shell as 404.html
      // makes deep links resolve to the app instead of a Pages error page.
      name: 'bildhaft:spa-404',
      closeBundle() {
        const out = resolve(import.meta.dirname, 'dist');
        copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'));
      },
    },
  ],
  optimizeDeps: {
    /* Svelte libraries, shipped as source (.svelte, .svelte.ts): the
       optimizer's svelte pass parses their TypeScript as JS and dies on the
       first type annotation (seen on every fresh install; a warm
       node_modules/.vite hides it). vite-plugin-svelte would exclude them
       itself if they declared a "svelte" field; until they do, they are
       named here and the dev server transforms them like the app's own. */
    exclude: ['@lautstark/bildquelle', '@lautstark/design', '@lautstark/sicherung', '@lautstark/werkzeuge'],
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
