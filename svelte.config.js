import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/* TypeScript inside components, and nothing else: no adapter, no kit, no
 * routing. bildhaft is one page — index.html and src/main.ts — and Vite has
 * always known that on its own. */
export default { preprocess: vitePreprocess() };
