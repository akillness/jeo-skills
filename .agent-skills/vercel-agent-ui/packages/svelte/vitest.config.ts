import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vitest/config"

// Compiles `.svelte` and `.svelte.ts` files for the tests. Server rendering
// tests run in Node; the rest run under jsdom with the browser build of
// Svelte, which Vitest doesn't pick on its own.
export default defineConfig({
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*-ssr.test.ts"],
        },
      },
      {
        extends: true,
        resolve: { conditions: ["browser"] },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*-ssr.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
})
