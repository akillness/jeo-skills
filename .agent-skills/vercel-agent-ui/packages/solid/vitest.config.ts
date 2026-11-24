import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vitest/config"

// Two projects: the DOM tests run Solid's client build in jsdom, and the SSR
// tests run its server build in Node, each compiled for that side.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [solid()],
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["test/setup.ts"],
          include: ["test/**/*.test.{ts,tsx}"],
          exclude: ["test/**/*-ssr.test.{ts,tsx}"],
        },
      },
      {
        plugins: [solid({ ssr: true })],
        test: {
          name: "ssr",
          environment: "node",
          include: ["test/**/*-ssr.test.{ts,tsx}"],
        },
      },
    ],
  },
})
