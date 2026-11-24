// Checks what each adapter entry costs an app against
// `size-budget.json`, and the code no entry may ship. tests/README.md
// ("Bundle size") says how each row is measured.
import { build, transform } from "esbuild"
import {
  appendFileSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { gzipSync } from "node:zlib"
import { compile, compileModule } from "svelte/compiler"
import { transform as compileSolid } from "@solidjs/compiler"

const root = path.resolve(import.meta.dirname, "..")
// Core modules are named from their folder, like "motion/presence" or "checkbox/checkbox".
const foundation = new Set(
  readdirSync(path.join(root, "packages/core/src/foundation"))
)
const coreFile = (module) =>
  `packages/core/src/${foundation.has(module.split("/")[0]) ? "foundation" : "components"}/${module}.ts`
const budgetFile = path.join(root, "size-budget.json")
const tolerance = 0.03

const { values: flags } = parseArgs({
  options: {
    update: { type: "boolean", default: false },
    strict: { type: "boolean", default: false },
  },
})

const coreManifest = readManifest("packages/core")
// Strings only development code has. The devtools hook and its console view
// must never reach production. Warnings move behind `#dev` with it, so once
// core has that import, a `console.warn` in production is a leak too.
const devMarkers = [
  "ui-sdk.devtools@1",
  "__UI_SDK__",
  ...(coreManifest.imports?.["#dev"] ? ["console.warn"] : []),
]

// The parts the perf pages render, by entry: a menu, a select and a combobox
// from `items` with a visible label, popovers with a title and a Close button,
// a modal dialog with a backdrop, tooltips, tabs, an accordion, checkboxes,
// radios, sliders named by a Field label, and toasts.
const perfPages = {
  menu: ["Menu", "MenuTrigger", "MenuContent", "MenuItem"],
  select: ["Select", "SelectLabel", "SelectTrigger", "SelectValue"],
  combobox: ["Combobox", "ComboboxLabel", "ComboboxInput"],
  popover: [
    "Popover",
    "PopoverTrigger",
    "PopoverContent",
    "PopoverTitle",
    "PopoverClose",
  ],
  dialog: [
    "Dialog",
    "DialogTrigger",
    "DialogBackdrop",
    "DialogContent",
    "DialogClose",
  ],
  tooltip: ["Tooltip", "TooltipTrigger", "TooltipContent"],
  tabs: ["Tabs", "TabsList", "TabsTab", "TabsPanel"],
  accordion: [
    "Accordion",
    "AccordionItem",
    "AccordionHeader",
    "AccordionTrigger",
    "AccordionPanel",
  ],
  checkbox: ["Checkbox", "CheckboxIndicator"],
  radio: ["RadioGroup", "Radio", "RadioIndicator"],
  slider: [
    "Slider",
    "SliderControl",
    "SliderTrack",
    "SliderIndicator",
    "SliderThumb",
  ],
  field: ["Field", "FieldLabel"],
  toast: ["ToastRegion", "toast"],
}

const adapters = [
  {
    name: "react",
    options: { external: ["react", "react-dom", "react/*", "react-dom/*"] },
  },
  {
    name: "svelte",
    // The conditions Vite resolves with in a production build, which turn
    // off the Svelte runtime's development code.
    options: {
      external: ["svelte", "svelte/*"],
      conditions: ["module", "production"],
      plugins: [svelteFiles()],
    },
    // React DOM ships whole, so a bare app already has all of it. Svelte's
    // runtime tree-shakes, and the parts of it an entry uses that a bare app
    // doesn't are the entry's cost too, so Svelte rows bundle the runtime
    // with a bare app and subtract the bare app alone.
    app: [
      `import { mount } from "svelte"`,
      `import App from "size:app.svelte"`,
      `mount(App, { target: document.body })`,
    ].join("\n"),
  },
  {
    name: "vue",
    // Vite's defaults for Vue's compile-time flags in a production build.
    options: {
      external: ["vue"],
      define: {
        __VUE_OPTIONS_API__: "true",
        __VUE_PROD_DEVTOOLS__: "false",
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
      },
    },
    // Vue's runtime tree-shakes like Svelte's, so an entry counts the parts
    // of it a bare app doesn't use, like `Teleport`.
    app: [
      `import { createApp, h } from "vue"`,
      `createApp({ render: () => h("button", "App") }).mount(document.body)`,
    ].join("\n"),
  },
  {
    name: "solid",
    options: {
      external: ["solid-js", "solid-js/*", "@solidjs/*"],
      conditions: ["module", "production"],
      plugins: [solidFiles()],
    },
    app: `import "size:app.tsx"`,
  },
  {
    name: "web",
    // Importing an entry defines its elements, so a page imports whole
    // entries. Behaviors with no elements, like `gesture`, come from core.
    options: {},
    defines: true,
  },
]

// Field ships only with a Field: a control joins a field through a small
// context module, so no other entry bundles it.
const fieldModule = /^packages\/core\/src\/components\/field\/[^/]+\.ts$/
// Optional parts ship only once a page renders them (`Feature` in core's
// `primitive-types.ts`): a page with a component's basic parts bundles none of
// these modules' code. A switch shares its control with Checkbox, but not the
// indicator's animation or the group.
const minimalPages = {
  switch: {
    parts: ["Switch", "SwitchThumb"],
    without: [
      "motion/presence",
      "checkbox/checkbox",
      "checkbox/checkbox-group",
    ],
  },
  checkbox: {
    parts: ["Checkbox", "CheckboxIndicator"],
    without: ["checkbox/checkbox-group"],
  },
  toggle: { parts: ["Toggle"], without: ["toggle/toggle-group"] },
  select: {
    parts: [
      "Select",
      "SelectTrigger",
      "SelectValue",
      "SelectContent",
      "SelectItem",
    ],
    without: ["lists/listbox-select-all", "lists/item-icon"],
  },
  menu: {
    parts: ["Menu", "MenuTrigger", "MenuContent", "MenuItem"],
    without: ["lists/item-icon"],
  },
  combobox: {
    parts: [
      "Combobox",
      "ComboboxInput",
      "ComboboxContent",
      "ComboboxList",
      "ComboboxItem",
    ],
    without: [
      "lists/listbox-select-all",
      "lists/item-icon",
      "combobox/combobox-chips",
    ],
  },
}
const minimalChecked = ["react", "vue", "svelte", "solid"]

// Core modules an entry must never bundle, by entry. A switch has no indicator
// to animate and no live attributes. Svelte's adapter writes styles through
// `kernel/live`, so its switch is checked by `minimalPages`.
const switchOnly = ["motion/presence", "kernel/live"]
const absent = {
  "@ui-sdk/react/switch": switchOnly,
  "@ui-sdk/vue/switch": switchOnly,
}

const budgets = flags.update ? {} : readJson(budgetFile)
const rows = []
const leaks = []
const strays = []
for (const adapter of adapters) {
  const bareApp = adapter.app
    ? gzip(
        (
          await bundleForProduction(
            { source: adapter.app },
            withRuntime(adapter)
          )
        ).code
      )
    : 0
  const entries = adapter.defines
    ? entriesOf(adapter.name)
    : adapterEntries(adapter.name)
  for (const entry of [...entries, perfPagesEntry(adapter)]) {
    // With the framework external, the code is the entry's alone, so the leak
    // check reads it: the Svelte runtime keeps its warnings in production.
    const own = await bundleForProduction(entry, adapter.options)
    const measured = adapter.app
      ? await bundleForProduction(
          withApp(entry, adapter.app),
          withRuntime(adapter)
        )
      : own
    rows.push({
      name: entry.name,
      size: gzip(measured.code) - bareApp,
      budget: budgets[entry.name],
    })
    const lazyName = `${entry.name} (lazy)`
    if (measured.lazy) {
      rows.push({
        name: lazyName,
        size: gzip(measured.lazy),
        budget: budgets[lazyName],
      })
    }
    for (const marker of devMarkers.filter(
      (marker) => own.code.includes(marker) || own.lazy.includes(marker)
    )) {
      leaks.push(
        `${entry.name} contains ${marker}, which only development code has.`
      )
    }
    strays.push(...fieldIn(entry, own.modules), ...absentIn(entry, own.modules))
  }
}
for (const adapter of adapters.filter(({ name }) =>
  minimalChecked.includes(name)
)) {
  for (const [key, page] of Object.entries(minimalPages)) {
    const entry = minimalPageEntry(adapter.name, key, page.parts)
    const { modules } = await bundleForProduction(entry, adapter.options)
    for (const module of page.without) {
      if (modules.has(coreFile(module))) {
        strays.push(
          `${entry.name} bundles ${coreFile(module)}, which only a part it doesn't render needs.`
        )
      }
    }
  }
}

printTable(rows)
if (flags.update) {
  writeBudgets(rows)
}
// For now growth past a budget is reported, not failed: `--strict` fails it,
// as CI will again once sizes settle.
const overBudget = flags.update ? [] : findBudgetFailures(rows)
if (overBudget.length && !flags.strict) {
  console.warn(`\n${overBudget.join("\n")}`)
  summarize(overBudget)
}
const failures = [...leaks, ...strays, ...(flags.strict ? overBudget : [])]
if (failures.length) {
  console.error(`\n${failures.join("\n")}`)
  process.exitCode = 1
}

/**
 * Every subpath of an adapter, like `@ui-sdk/react/menu`. Each of core's
 * component entries must have a subpath of the same name. Svelte's root entry
 * re-exports them all, so it has no row of its own.
 */
function adapterEntries(adapter) {
  const adapterExports = readManifest(`packages/${adapter}`).exports
  const missing = Object.keys(coreManifest.exports).filter(
    // `renderer` is for the renderers themselves and `testing` for tests, so neither ships in an app.
    (key) =>
      key !== "." &&
      key !== "./renderer" &&
      key !== "./testing" &&
      !key.endsWith(".css") &&
      !key.includes("*") &&
      !adapterExports[key]
  )
  if (missing.length) {
    throw new Error(
      `@ui-sdk/${adapter} has no export for the core entries ${missing.join(", ")}.`
    )
  }
  return entriesOf(adapter)
}

// Every subpath of an adapter but its root. An entry outside `src`, like
// `@ui-sdk/vue/nuxt`, runs in a build tool, not in an app.
function entriesOf(adapter) {
  return Object.entries(readManifest(`packages/${adapter}`).exports)
    .filter(([key, file]) => key !== "." && file.startsWith("./src/"))
    .map(([key, file]) => ({
      name: `@ui-sdk/${adapter}/${key.slice(2)}`,
      file: path.join(root, `packages/${adapter}`, file),
    }))
}

// The Field modules an entry bundles, unless it is Field.
function fieldIn(entry, modules) {
  if (!entry.file || entry.name.split("/").pop() === "field") {
    return []
  }
  return [...modules]
    .filter((module) => fieldModule.test(module))
    .map(
      (module) => `${entry.name} bundles ${module}, which only a Field needs.`
    )
}

// The core modules an entry bundles that `absent` says it must not.
function absentIn(entry, modules) {
  return (absent[entry.name] ?? [])
    .filter((module) => modules.has(coreFile(module)))
    .map(
      (module) =>
        `${entry.name} bundles ${coreFile(module)}, which it must never need.`
    )
}

// One entry that imports every part the perf pages use, from the adapter's subpaths.
function perfPagesEntry({ name, defines }) {
  const adapterExports = readManifest(`packages/${name}`).exports
  const imports = Object.entries(perfPages).map(([key, names]) => {
    const file = JSON.stringify(
      path.join(root, `packages/${name}`, adapterExports[`./${key}`])
    )
    return defines
      ? `import ${file}`
      : `export { ${names.join(", ")} } from ${file}`
  })
  return { name: `@ui-sdk/${name} (perf pages)`, source: imports.join("\n") }
}

// One entry that imports a component's basic parts, from the adapter's subpath.
function minimalPageEntry(adapter, key, parts) {
  const file = path.join(
    root,
    `packages/${adapter}`,
    readManifest(`packages/${adapter}`).exports[`./${key}`]
  )
  return {
    name: `@ui-sdk/${adapter}/${key} (${parts.join(", ")})`,
    source: `export { ${parts.join(", ")} } from ${JSON.stringify(file)}`,
  }
}

// The entry and a bare app in one source, as an app that imports the entry.
function withApp(entry, app) {
  return {
    source: `${entry.source ?? `export * from ${JSON.stringify(entry.file)}`}\n${app}`,
  }
}

// The build options that bundle the framework's runtime with the entry.
function withRuntime(adapter) {
  return { ...adapter.options, external: [] }
}

function gzip(code) {
  return gzipSync(code, { level: 9 }).length
}

// The code a page loads up front for the entry, the entry's chunk and every
// chunk it imports statically, and the code it loads later with `import()`.
// An entry is a `file`, or a `source` written here.
async function bundleForProduction(entry, options) {
  const shared = {
    entryPoints: { entry: entry.file ?? "size:entry" },
    bundle: true,
    minify: true,
    format: "esm",
    outdir: "out",
    platform: "browser",
    target: "es2022",
    ...options,
    plugins: [
      ...(options.plugins ?? []),
      ...(entry.source === undefined ? [] : [sourceEntry(entry.source)]),
    ],
    define: { ...options.define, "process.env.NODE_ENV": '"production"' },
    write: false,
    metafile: true,
    logLevel: "error",
  }
  // Vite drops an `import()` in code it shakes out. esbuild still splits it,
  // which moves shared code into a chunk the entry imports, so a build without
  // splitting first finds what ships and the rest stays out.
  const whole = await build(shared)
  const result = await build({
    ...shared,
    splitting: true,
    plugins: [
      unshippedImports(keptModules(Object.values(whole.metafile.outputs))),
      ...shared.plugins,
    ],
  })
  const outputs = result.metafile.outputs
  // The chunks a page loads up front, then the ones it can load later. esbuild
  // writes a chunk for every `import()` in a bundled module, even one in code
  // it shook out, so only chunks some kept code imports count, as in Vite.
  const reach = (from, kinds, found = new Set()) => {
    const visit = (output) => {
      if (found.has(output)) {
        return
      }
      found.add(output)
      for (const { path: imported, kind } of outputs[output].imports) {
        if (kinds.includes(kind) && outputs[imported]) {
          visit(imported)
        }
      }
    }
    for (const output of from) {
      visit(output)
    }
    return found
  }
  const upfront = reach(["out/entry.js"], ["import-statement"])
  const loadable = reach(upfront, ["import-statement", "dynamic-import"])
  const text = (output) =>
    result.outputFiles.find((file) => file.path.endsWith(output)).text
  const join = (list) => list.map(text).join("\n")
  const all = Object.keys(outputs).filter(
    (output) => output.endsWith(".js") && loadable.has(output)
  )
  return {
    code: join(all.filter((output) => upfront.has(output))),
    lazy: join(all.filter((output) => !upfront.has(output))),
    modules: keptModules(all.map((output) => outputs[output])),
  }
}

// The source files with code in these outputs, relative to the root.
function keptModules(outputs) {
  return new Set(
    outputs.flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput)
        .map(([file]) => file)
    )
  )
}

// Leaves out each `import()` of a module that isn't in `kept`.
function unshippedImports(kept) {
  return {
    name: "unshipped-imports",
    setup(build) {
      build.onResolve(
        { filter: /.*/ },
        async ({ path: specifier, kind, importer, resolveDir, pluginData }) => {
          if (kind !== "dynamic-import" || pluginData === unshippedImports) {
            return
          }
          const resolved = await build.resolve(specifier, {
            kind,
            importer,
            resolveDir,
            pluginData: unshippedImports,
          })
          if (resolved.errors.length || resolved.namespace !== "file") {
            return
          }
          if (!kept.has(path.relative(root, resolved.path))) {
            return { path: specifier, external: true }
          }
        }
      )
    },
  }
}

// Serves an entry written in memory, resolving its imports from the repository root.
function sourceEntry(source) {
  return {
    name: "source-entry",
    setup(build) {
      build.onResolve({ filter: /^size:entry$/ }, ({ path }) => ({
        path,
        namespace: "size",
      }))
      build.onLoad({ filter: /.*/, namespace: "size" }, () => ({
        contents: source,
        resolveDir: root,
      }))
    },
  }
}

// Compiles `.svelte` components and `.svelte.ts` runes modules for the client
// the way `@sveltejs/vite-plugin-svelte` does in a production build. Svelte
// strips the types in a component's script itself; a runes module loses its
// types first, as Vite's TypeScript transform runs before the plugin. Every
// entry bundles the same files, so each compiles once.
//
// It also serves `size:app.svelte`, the one component of a bare app.
function svelteFiles() {
  const options = (filename) => ({ filename, generate: "client", dev: false })
  const component = (source, filename) =>
    compile(source, { ...options(filename), css: "external" }).js.code
  const runesModule = async (source, filename) => {
    const { code } = filename.endsWith(".ts")
      ? await transform(source, { loader: "ts" })
      : { code: source }
    return compileModule(code, options(filename)).js.code
  }
  const compiled = new Map()
  const load = async (file, compileSource) => {
    if (!compiled.has(file)) {
      compiled.set(
        file,
        readFile(file, "utf8").then((source) => compileSource(source, file))
      )
    }
    return { contents: await compiled.get(file), loader: "js" }
  }
  return {
    name: "svelte",
    setup(build) {
      build.onResolve({ filter: /^size:app\.svelte$/ }, ({ path }) => ({
        path,
        namespace: "size-app",
      }))
      build.onLoad({ filter: /.*/, namespace: "size-app" }, () => ({
        contents: component(
          `<button onclick={() => {}}>App</button>`,
          "App.svelte"
        ),
        resolveDir: root,
        loader: "js",
      }))
      build.onLoad(
        { filter: /\.svelte$/, namespace: "file" },
        ({ path: file }) => load(file, component)
      )
      build.onLoad(
        { filter: /\.svelte\.(js|ts)$/, namespace: "file" },
        ({ path: file }) => load(file, runesModule)
      )
    },
  }
}

// Compiles `.tsx` components for the client the way `@solidjs/vite-plugin`
// does in a production build, then strips their types. It also serves
// `size:app.tsx`, the one component of a bare app.
function solidFiles() {
  const options = { generate: "dom", hydratable: false, dev: false }
  const app = `import { render } from "@solidjs/web"
render(() => <button onClick={() => {}}>App</button>, document.body)`
  return {
    name: "solid",
    setup(build) {
      build.onResolve({ filter: /^size:app\.tsx$/ }, ({ path }) => ({
        path,
        namespace: "size-app",
      }))
      build.onLoad({ filter: /.*/, namespace: "size-app" }, () => ({
        contents: compileSolid(app, { ...options, filename: "app.tsx" }).code,
        resolveDir: root,
        loader: "ts",
      }))
      build.onLoad(
        { filter: /\.tsx$/, namespace: "file" },
        async ({ path: file }) => ({
          contents: compileSolid(await readFile(file, "utf8"), {
            ...options,
            filename: file,
          }).code,
          loader: "ts",
        })
      )
    },
  }
}

function findBudgetFailures(rows) {
  return rows.flatMap(({ name, size, budget }) => {
    if (budget === undefined) {
      return [`${name} has no budget. Run \`pnpm size --update\`.`]
    }
    if (size <= budget * (1 + tolerance)) {
      return []
    }
    return [
      `${name} is ${formatBytes(size)}, over its ${formatBytes(budget)} budget by more than ${tolerance * 100}%.`,
    ]
  })
}

function summarize(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return
  }
  const list = lines.map((line) => `- ${line}`).join("\n")
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Bundle size over budget\n\n${list}\n`
  )
}

function writeBudgets(rows) {
  const budgets = Object.fromEntries(rows.map(({ name, size }) => [name, size]))
  writeFileSync(budgetFile, JSON.stringify(budgets, null, 2) + "\n")
  console.log(`\nWrote ${rows.length} budgets to size-budget.json.`)
}

function printTable(rows) {
  const width = Math.max(...rows.map((row) => row.name.length))
  console.log(
    `${"Entry".padEnd(width)}  ${"gzip".padStart(9)}  ${"budget".padStart(9)}  change`
  )
  for (const { name, size, budget } of rows) {
    const change =
      budget === undefined
        ? "new"
        : `${(((size - budget) / budget) * 100).toFixed(1)}%`
    const budgetText = budget === undefined ? "-" : formatBytes(budget)
    console.log(
      `${name.padEnd(width)}  ${formatBytes(size).padStart(9)}  ${budgetText.padStart(9)}  ${change}`
    )
  }
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`
}

function readManifest(packagePath) {
  return readJson(path.join(root, packagePath, "package.json"))
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"))
}
