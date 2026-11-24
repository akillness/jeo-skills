import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

// TypeScript inside the `.svelte` examples, for the Vite plugin and svelte-check.
// Examples keep the shared contract's `<output role="status">`, which the
// accessibility lint calls redundant, so that one rule stays quiet here.
export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    warningFilter: (warning) => warning.code !== "a11y_no_redundant_roles",
  },
}
