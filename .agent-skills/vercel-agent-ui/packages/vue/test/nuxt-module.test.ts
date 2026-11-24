import { runWithNuxtContext } from "@nuxt/kit"
import type { Nuxt } from "@nuxt/schema"
import { expect, test, vi } from "vitest"
import uiSdk from "../nuxt/module"

vi.mock("node:fs", () => ({
  existsSync: () => true,
  readFileSync: () => "[]",
}))

test("the dev server pre-bundles every core entry in one pass, next to the app's own", async () => {
  const nuxt = {
    _version: "4.4.0",
    options: {
      vite: { optimizeDeps: { include: ["@ui-sdk/core/tabs"] } },
      _requiredModules: {},
    },
    hook: () => () => {},
    callHook: async () => {},
  } as unknown as Nuxt
  await runWithNuxtContext(nuxt, () => uiSdk({}, nuxt))
  expect(nuxt.options.vite.optimizeDeps?.include).toEqual([
    "@ui-sdk/core/tabs",
    "@ui-sdk/core",
    "@ui-sdk/core/*",
  ])
  expect(nuxt.options.vite.optimizeDeps?.exclude).toBeUndefined()
})
