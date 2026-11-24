import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

// TypeScript inside `.svelte` files, for the Vite plugin, svelte-check and svelte-package.
export default { preprocess: vitePreprocess() }
