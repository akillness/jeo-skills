import { existsSync, readFileSync } from "node:fs"
import { addComponent, addImportsSources, defineNuxtModule } from "@nuxt/kit"
import type { NuxtModule } from "@nuxt/schema"
import { type NuxtEntry, nuxtRegistrations } from "./registrations"

/**
 * The options of the Nuxt module, set under `uiSdk` in `nuxt.config.ts`.
 * @experimental
 */
interface ModuleOptions {
  /** Prepended to every component's name, so `"U"` registers `<UDialogTrigger>`. Empty by default. */
  prefix?: string
}

/**
 * The Nuxt module: every part of every entry becomes an auto-imported
 * component, and the controllers and helpers become auto-imports in `<script>`.
 * Add `"@ui-sdk/vue"` to `modules` in `nuxt.config.ts`.
 * @experimental
 */
const uiSdk: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: "@ui-sdk/vue",
    configKey: "uiSdk",
    compatibility: { nuxt: "^4.0.0 || ^5.0.0-0" },
  },
  defaults: { prefix: "" },
  setup(options, nuxt) {
    // Nuxt transpiles this package, so it imports the core's own files unless the
    // entry was pre-bundled up front. Listing every entry gives it and the app one copy.
    const optimizeDeps = (nuxt.options.vite.optimizeDeps ??= {})
    optimizeDeps.include = [
      ...(optimizeDeps.include ?? []),
      "@ui-sdk/core",
      "@ui-sdk/core/*",
    ]
    const { components, imports } = nuxtRegistrations(
      readEntries(),
      options.prefix ?? ""
    )
    for (const component of components) {
      addComponent(component)
    }
    addImportsSources(imports)
  },
})

// The build writes it beside the built module. An app linking the workspace
// runs this file from `nuxt/`, so it reads the build's copy in `dist`.
function readEntries() {
  const built = new URL("./entries.json", import.meta.url)
  const file = existsSync(built)
    ? built
    : new URL("../dist/nuxt/entries.json", import.meta.url)
  return JSON.parse(readFileSync(file, "utf8")) as NuxtEntry[]
}

export type { ModuleOptions }
export default uiSdk
