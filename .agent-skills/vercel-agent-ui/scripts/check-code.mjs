// The code rules from AGENTS.md that a script can check. Prints
// `file:line rule message` per violation and exits 1 on any.
//
// - return-type: no return type annotation on a function with a body, in
//   packages/*/src (.ts, .tsx and Svelte `<script lang="ts">` blocks; there are
//   no .vue files there). Type predicates and assertion signatures are fine, and
//   so is a primitive's `state` function, since `definePrimitive` infers State
//   from it. A function that needs one anyway takes
//   `// check-code: allow return-type <why>` on the line above, and every
//   allowance is printed.
//   `--fix` deletes the annotations it reports.
// - popup-steps: no `popup.opening(` or `popup.returnFocus(` in packages/*/src
//   outside the files in `popupStepsAllowlist`. A popup component opens and
//   closes through `createOpenSteps`, which runs those steps in order.
// - drag-session: no `bindDrag(` in packages/*/src outside the files in
//   `dragSessionAllowlist`. A component drags through `createDragSession`,
//   which takes one press at a time and ends a drag cut short as canceled.
// - html-sinks: no `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
//   `dangerouslySetInnerHTML`, `{@html}`, `v-html`, `srcdoc`, `document.write`,
//   `eval` or `new Function` in packages/*/src outside the files in
//   `htmlSinkAllowlist`. Markup written from a string runs what the string
//   holds, so each place that does it says why its string is safe.
// - url-sinks: no write to `href`, `src`, `action` or `formAction`, by
//   property or `setAttribute`, and no `location.assign`, `location.replace`
//   or `window.open`, in packages/*/src outside the files in
//   `urlSinkAllowlist`. A URL from data can be `javascript:`. An `href` an
//   app passes to a part is the app's own and isn't a write here.
// - slot-roles: no `role:` in a slot's `attrs` in packages/core/src. A slot
//   declares its role, `role: "option"`, so its types and development builds
//   check what the role needs.
// - import-layers: core's folders import downward only. `foundation/kernel`
//   imports nothing else in core. `foundation/platform` imports only the
//   kernel. A job folder (`focus`, `lists`, `popups` and the rest) imports the
//   kernel, platform and other job folders. Components import foundation, and
//   `page` imports anything. Nothing below `page` imports `page` or a
//   component. Each foundation folder's `index.ts` lists what other folders
//   may import from its files, and an import from another folder names only
//   what that list has. Imports name the file, not the index, since a bundler
//   places a module by what imports reach and would pull lazily loaded code
//   into every entry. The exceptions are in `importLayersAllowlist`.
// - public-docs: every export of the public entries of core and each adapter
//   (`documentedPackages` in `public-exports.mjs`, every entry in their
//   package.json `exports`) has a JSDoc comment, so an agent reading the
//   types, or someone hovering a component in their editor, learns what each
//   one is for. A Svelte component takes a `<!-- @component -->` comment
//   instead, which Svelte's tooling shows the same way.
// - public-docs-pages: every one of those exports but its types and its
//   primitives (which their component's page covers) is named on a docs page
//   in apps/docs/content/docs, so nothing public is only in the types. The
//   ones not on a page yet are in `undocumentedExports`, which only shrinks.
// - name-only-docs: a field or method's JSDoc in packages/*/src says more
//   than its name and its type's name, so "Whether the item is selected." on
//   `ItemState.selected` fails, and so do "The orientation." and "Whether
//   it's open.". Say what sets it, when it changes or what it holds.
// - stability: each of those exports says what it promises with exactly one
//   of `@stable` (follows semver) or `@experimental` (may change in any minor
//   release), at the end of its JSDoc, or in a Svelte component's
//   `<!-- @component -->` comment. The Reference page and llms.txt mark the
//   experimental ones. `codemods/stability-labels.mjs` adds the labels.
//   A top-level declaration in packages/*/src that nothing public exports
//   carries neither label, since a label tells a reader the name is API.
// - exports-at-end: a module declares everything without `export` and lists
//   its exports once, at its end, so one look shows a file's whole surface.
//   Re-exports and a default export go at the end too. Covers every .ts, .tsx,
//   .js and .mjs file but .d.ts files and the paths in `exportsAtEndSkips`.
// - renderer-imports: the renderers (`renderers`) never import
//   `@ui-sdk/core/internal`. What they need that isn't public comes from
//   `@ui-sdk/core/renderer`, a checked list of its own.
// - public-names: a public function of core says its kind with its name, so
//   an agent can tell what it does before reading it. `define*` makes a
//   primitive and `create*` something stateful. `bind*` takes an element and
//   returns a cleanup, and a function that does both is a `bind*`. `is*`,
//   `has*` and `supports*` answer yes or no, and a function that answers yes
//   or no is one of them. `*Attrs` returns attributes. `register*` is only for
//   page-wide registries. Anything else is an action (a bare verb) or a pure
//   helper (a noun, `*Of`, `*Message`), which a script can't tell apart. Names
//   in `publicNameAllowlist` are exempt.
// - internal-exports: nothing a public entry exports says `@internal`. A
//   declaration only renderers need goes through `@ui-sdk/core/renderer` or
//   a module that isn't an entry; one people may use drops the tag.
// - nuxt-imports: nothing in packages/*/src imports Nuxt. Every Vue app runs
//   that code and Nuxt is an optional peer, so only `packages/vue/nuxt` may.
// - api-files: core's function that builds an api, like `comboboxApi`, is
//   declared in its component's own file, or in `<name>-api.ts` once it moves
//   out of it, so every component splits the same way. An exported `*Api`
//   lives in a file named for it or ending in `-api.ts`.
// - named-api: core declares an api's type as an interface, like
//   `interface ComboboxApi extends ReturnType<typeof comboboxApiBody> {}`,
//   never `type ComboboxApi = ReturnType<…>`. A `type` is only another name for
//   the inferred object, so declaration files spell the whole api out again at
//   every slot that uses it, which made core's types ten times their size.
// - entry-types: each renderer's entry for a component re-exports every type
//   core's entry for it exports, and no other type of core's, by name in an
//   `export type { } from "@ui-sdk/core/<name>"`, so `@ui-sdk/vue/accordion`
//   offers the types `@ui-sdk/react/accordion` does. Core's entry has the
//   same name, or the one `coreEntryOf` gives. A type whose name the entry
//   already gives something else, like the `Toast` component, may be left out
//   or renamed; any other type keeps its name.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { publicEntries, publicExports } from "./public-exports.mjs"

// Paths exports-at-end leaves alone, each with why. A key ending in / covers the folder.
const exportsAtEndSkips = {
  "examples/":
    "Docs examples are snippets to copy, each exporting one Example where it's declared.",
  "apps/docs/app/":
    "Next.js reads route config like `dynamic` only from an `export const` where it's declared.",
  "apps/docs/proxy.ts":
    "Next.js reads the proxy's `config` only from an `export const` where it's declared.",
}
const exportsAtEndCovers = ["examples/experiments/", "examples/scripts/"]

// Files under packages/ that may call a popup's open and close steps, each with why.
const popupStepsAllowlist = {
  "packages/core/src/foundation/popups/popup.ts": "Defines them.",
  "packages/core/src/foundation/popups/popup-steps.ts":
    "Runs them in order for every popup component.",
}

// Files under packages/ that may follow a pointer with `bindDrag` directly, each with why.
const dragSessionAllowlist = {
  "packages/core/src/foundation/drag-and-drop/pointer.ts":
    "Defines it, and the session on it.",
  "packages/core/src/components/resizable/resizable-dom.ts":
    "One press can drag two handles where they meet, one along each axis.",
}

// Files under packages/ that may write or read markup as a string, each with why its string is safe.
const htmlSinkAllowlist = {
  "packages/core/src/components/token-input/token-input-view.ts":
    "Parses its own markup, built from escaped text, in a template that never joins the page, to compare it with the server's.",
  "packages/react/src/token-input.tsx":
    "Writes the editor's markup, which core builds from escaped text.",
  "packages/solid/src/token-input.tsx":
    "Writes the editor's markup, which core builds from escaped text.",
  "packages/svelte/src/token-input/token-input-editor.svelte":
    "Writes the editor's markup, which core builds from escaped text.",
  "packages/vue/src/token-input.ts":
    "Writes the editor's markup, which core builds from escaped text.",
  "packages/react/src/preferences.tsx":
    "Writes the script that shows saved preferences before paint. Core builds it from JSON with `<` escaped.",
  "packages/solid/src/preferences.tsx":
    "Writes the script that shows saved preferences before paint. Core builds it from JSON with `<` escaped.",
  "packages/svelte/src/preferences/preferences.svelte":
    "Writes the script that shows saved preferences before paint. Core builds it from JSON with `<` escaped.",
  "packages/vue/src/preferences.ts":
    "Writes the script that shows saved preferences before paint. Core builds it from JSON with `<` escaped.",
  "packages/web/src/list.ts":
    "Reads an item's markup to tell whether it was made again. Writes none.",
  "packages/web/src/date-picker.ts":
    "Writes its own calendar icon, a constant.",
}

// Files under packages/ that may write a URL, each with why.
const urlSinkAllowlist = {
  "packages/core/src/foundation/image/crop.ts":
    "Loads the image an app passes to crop into an `Image` that never joins the page.",
}

// Imports across core's layers that import-layers lets through, by folder, each with why.
const importLayersAllowlist = {
  "foundation/kernel -> foundation/platform":
    "A pending action loads the announcer when it first needs it, and a part that can be hidden writes the rule that keeps it hidden.",
  "components/date-input -> components/calendar":
    "Date Input matches unavailable dates the way Calendar does.",
  "components/date-picker -> components/calendar":
    "Date Picker is a field over Calendar.",
  "components/drawer -> components/dialog": "Drawer is a dialog with a sheet.",
  "components/rating -> components/radio":
    "Rating is a radio group with a radio per star.",
  "components/segmented-control -> components/radio":
    "Segmented Control is a radio group with a sliding indicator.",
  "components/menu -> components/menubar":
    "A menu inside a menubar hands focus across.",
  "components/menubar -> components/menu": "Menubar's menus are Menus.",
  "components/dialog -> page/overlays":
    "`confirm()` renders through the overlay host.",
  "components/toast -> page/overlays":
    "`toast()` renders through the overlay host.",
}

// Public exports public-docs-pages lets through until a docs page names them.
const undocumentedExports = new Set([
  "AutocompleteItems",
  "ComboboxItems",
  "CommandItems",
  "ListboxItems",
  "MenuItems",
  "SelectItems",
  "TreeItems",
  "TriggerMenuItems",
  "createOverlays",
  "defaultCodec",
  "ratingItemValues",
])

// Core's public functions that public-names lets through, each with why.
const publicNameAllowlist = {
  on: "Adds a listener and returns its cleanup, like the DOM's own `on…` handlers. Kept short on purpose.",
  live: "Declares a slot's live attributes in a primitive's definition.",
  selects: "Declares which state a slot reads in a primitive's definition.",
  direct: "Declares a slot's direct attributes in a primitive's definition.",
  elements: "Declares a primitive's elements in its definition.",
  applyAttrs: "An action that writes attributes to an element, verb first.",
  dispatch: "An action that runs a callback and says whether it was canceled.",
  animateIn: "An action that animates an element, and returns what stops it.",
  animateOut: "An action that animates an element, and returns what stops it.",
  partPresent:
    "Reads a part in `@ui-sdk/core/testing`, named like `partAttrs` and `partState`.",
}
// The page-wide registries `register*` may name.
const registries = ["registerShortcut", "registerTools"]

// The packages that render primitives, which import core only through its entries.
const renderers = ["react", "vue", "solid", "svelte", "web"]

// Renderer entries whose component lives in a core entry of another name, each with why.
const coreEntryOf = {
  textarea: {
    entry: "input",
    why: "Textarea's primitive is in core's input entry.",
  },
}

const root = path.resolve(import.meta.dirname, "..")
const allowReturnType = /\/\/\s*check-code: allow return-type\b(.*)/
const svelteScript =
  /<script\b[^>]*\blang=["']ts["'][^>]*>([\s\S]*?)<\/script>/g
const popupStep = /\bpopup\??\.(opening|returnFocus)\(/
const htmlSink =
  /\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|srcdoc|setHTMLUnsafe|createContextualFragment|parseFromString)\b|\{@html\b|\bv-html\b|\bdocument\.write(ln)?\(|\beval\(|\bnew Function\(/g
const urlSink =
  /\.(href|src|action|formAction)\s*=(?![=>])|\bsetAttribute\(\s*["'`](href|src|action|formaction|xlink:href)["'`]|\blocation\.(assign|replace)\(|\bwindow\.open\(/g
const commentLine = /^\s*(\/\/|\/?\*|<!--)/
const svelteComponentDoc = /^<!--\s*@component\b/m
const svelteComponentComment = /^<!--\s*@component\b[\s\S]*?-->/m
const svelteStabilityLabel = /^\s*@(stable|experimental)\s*$/gm
const stabilityLabels = ["stable", "experimental"]
// Words a doc may add to a name and still say nothing.
const fillerWords = new Set(docWords("the a an it its s is whether this of"))

const shouldFix = process.argv.includes("--fix")
const violations = []
const allowances = []
checkReturnTypes()
checkPopupSteps()
checkDragSession()
checkSinks()
checkSlotRoles()
checkImportLayers()
const surface = publicExports(root)
checkPublicDocs()
checkPublicDocsPages()
checkNameOnlyDocs()
checkStability()
checkInternalStability()
checkExportsAtEnd()
checkPublicNames()
checkRendererImports()
checkNuxtImports()
checkApiFiles()
checkNamedApi()
checkInternalExports()
checkEntryTypes()

for (const allowance of allowances) {
  console.log(allowance)
}
if (violations.length) {
  console.error(
    violations
      .map(
        ({ file, line, rule, message }) => `${file}:${line} ${rule} ${message}`
      )
      .join("\n")
  )
  process.exitCode = 1
}

function checkReturnTypes() {
  const sources = packageSources().map((file) => {
    const text = readFileSync(file, "utf8")
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const blocks = typeScriptBlocks(file, text).map((block) => ({
      ...block,
      sourceFile: ts.createSourceFile(
        file,
        block.code,
        ts.ScriptTarget.Latest,
        true,
        kind
      ),
    }))
    return { file, text, blocks }
  })
  // Functions a primitive's `state` names, in any file: `state: initialSelectState`,
  // or `state: (options) => toggleState(options)`.
  const stateNames = new Set()
  for (const { blocks } of sources) {
    for (const { sourceFile } of blocks) {
      collectStateNames(sourceFile)
    }
  }

  function collectStateNames(node) {
    if (isStateProperty(node)) {
      const value = node.initializer
      const called =
        ts.isArrowFunction(value) && ts.isCallExpression(value.body)
          ? value.body.expression
          : value
      if (ts.isIdentifier(called)) {
        stateNames.add(called.text)
      }
    }
    ts.forEachChild(node, collectStateNames)
  }

  function isStateFunction(node) {
    if (isStateProperty(node.parent) && node.parent.initializer === node) {
      return true
    }
    if (ts.isFunctionDeclaration(node)) {
      return !!node.name && stateNames.has(node.name.text)
    }
    const declaration = node.parent
    return (
      ts.isVariableDeclaration(declaration) &&
      ts.isIdentifier(declaration.name) &&
      stateNames.has(declaration.name.text)
    )
  }

  for (const { file, text, blocks } of sources) {
    const lines = text.split("\n")
    const relative = path.relative(root, file)
    // Each annotation as [start, end] in the file, from its colon to the end of the type.
    const annotations = []
    for (const { code, start, lineOffset, sourceFile } of blocks) {
      const lineOf = (position) =>
        sourceFile.getLineAndCharacterOfPosition(position).line + lineOffset
      visit(sourceFile)

      function visit(node) {
        if (
          ts.isFunctionLike(node) &&
          node.body &&
          node.type &&
          !ts.isTypePredicateNode(node.type) &&
          !isStateFunction(node)
        ) {
          const startLine = lineOf(node.getStart(sourceFile))
          const allow = lines[startLine - 1]?.match(allowReturnType)
          const reason = allow?.[1].trim()
          if (reason) {
            allowances.push(
              `${relative}:${startLine + 1} allowed return-type: ${reason}`
            )
          } else if (shouldFix && !allow) {
            annotations.push([
              start + code.lastIndexOf(":", node.type.getStart(sourceFile)),
              start + node.type.end,
            ])
          } else {
            violations.push({
              file: relative,
              line: lineOf(node.type.getStart(sourceFile)) + 1,
              rule: "return-type",
              message: allow
                ? "the allow comment needs a reason."
                : "remove the return type annotation and let it infer.",
            })
          }
        }
        ts.forEachChild(node, visit)
      }
    }
    if (annotations.length) {
      const fixed = annotations.reduceRight(
        (result, [start, end]) => result.slice(0, start) + result.slice(end),
        text
      )
      writeFileSync(file, fixed)
    }
  }
}

function isStateProperty(node) {
  return (
    !!node &&
    ts.isPropertyAssignment(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "state"
  )
}

// The TypeScript in a file, with its offset and the zero-based line it starts on.
function typeScriptBlocks(file, text) {
  if (!file.endsWith(".svelte")) {
    return [{ code: text, start: 0, lineOffset: 0 }]
  }
  return [...text.matchAll(svelteScript)].map((match) => {
    const start = match.index + match[0].indexOf(">") + 1
    return {
      code: match[1],
      start,
      lineOffset: text.slice(0, start).split("\n").length - 1,
    }
  })
}

// Every .ts, .tsx and .svelte file under each package's src, without .d.ts.
function packageSources() {
  const packagesDir = path.join(root, "packages")
  const packages = readdirSync(packagesDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory()
  )
  return packages.flatMap(({ name }) => {
    const src = path.join(packagesDir, name, "src")
    if (!existsSync(src)) {
      return []
    }
    return readdirSync(src, { recursive: true, withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /\.(tsx?|svelte)$/.test(entry.name) &&
          !entry.name.endsWith(".d.ts")
      )
      .map((entry) => path.join(entry.parentPath, entry.name))
  })
}

function checkPopupSteps() {
  for (const file of packageSources()) {
    const relative = path.relative(root, file)
    if (relative in popupStepsAllowlist) {
      continue
    }
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        const step = text.match(popupStep)?.[1]
        if (!step) {
          return
        }
        violations.push({
          file: relative,
          line: index + 1,
          rule: "popup-steps",
          message: `open and close through \`createOpenSteps\` instead of calling \`popup.${step}\` yourself.`,
        })
      })
  }
}

function checkSinks() {
  const rules = [
    {
      rule: "html-sinks",
      sink: htmlSink,
      allowlist: htmlSinkAllowlist,
      message: (found) =>
        `\`${found}\` runs what its string holds. Build elements instead, or add the file to \`htmlSinkAllowlist\` with why its string is safe.`,
    },
    {
      rule: "url-sinks",
      sink: urlSink,
      allowlist: urlSinkAllowlist,
      message: (found) =>
        `\`${found}\` writes a URL, which can be \`javascript:\`. Leave URLs to the app, or add the file to \`urlSinkAllowlist\` with why.`,
    },
  ]
  const sources = packageSources().map((file) => path.relative(root, file))
  for (const { rule, sink, allowlist, message } of rules) {
    for (const file of Object.keys(allowlist)) {
      if (!sources.includes(file)) {
        violations.push({
          file,
          line: 1,
          rule,
          message:
            "is on the allowlist but isn't in packages/*/src. Remove it.",
        })
      }
    }
    for (const relative of sources) {
      if (relative in allowlist) {
        continue
      }
      // Read whole, with comment lines blank, since a formatter breaks a
      // long call like `setAttribute("href", url)` over lines.
      const code = readFileSync(path.join(root, relative), "utf8")
        .split("\n")
        .map((text) => (commentLine.test(text) ? "" : text))
        .join("\n")
      for (const found of code.matchAll(sink)) {
        violations.push({
          file: relative,
          line: code.slice(0, found.index).split("\n").length,
          rule,
          message: message(found[0].replace(/\s+/g, " ").trim()),
        })
      }
    }
  }
}

function checkDragSession() {
  for (const file of packageSources()) {
    const relative = path.relative(root, file)
    if (relative in dragSessionAllowlist) {
      continue
    }
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        if (!/\bbindDrag\(/.test(text)) {
          return
        }
        violations.push({
          file: relative,
          line: index + 1,
          rule: "drag-session",
          message:
            "drag through `createDragSession` instead of calling `bindDrag` yourself.",
        })
      })
  }
}

// A helper passed as `attrs: fn` has no body here; development builds check what it returns.
function* attrsBodies(text) {
  for (const match of text.matchAll(/\battrs\s*:/g)) {
    const arrow = text.indexOf("=>", match.index)
    if (
      arrow < 0 ||
      !/^\s*(?:\w+|\((?:[^()]|\([^()]*\))*\))\s*$/.test(
        text.slice(match.index + match[0].length, arrow)
      )
    ) {
      continue
    }
    const open = text.indexOf("{", arrow)
    if (open < 0) {
      continue
    }
    let depth = 0
    let end = open
    for (; end < text.length; end++) {
      if (text[end] === "{") {
        depth++
      } else if (text[end] === "}" && --depth === 0) {
        break
      }
    }
    yield { start: open, body: text.slice(open, end) }
  }
}

function checkSlotRoles() {
  for (const file of packageSources()) {
    const relative = path.relative(root, file)
    if (!relative.startsWith("packages/core/src/")) {
      continue
    }
    const text = readFileSync(file, "utf8")
    for (const { start, body } of attrsBodies(text)) {
      for (const role of body.matchAll(/\brole:\s/g)) {
        violations.push({
          file: relative,
          line: text.slice(0, start + role.index).split("\n").length,
          rule: "slot-roles",
          message:
            'declare the role on the slot, `role: "…"`, instead of in `attrs`, so core checks what it needs.',
        })
      }
    }
  }
}

function checkImportLayers() {
  const src = path.join(root, "packages/core/src")
  // `foundation/focus`, `components/dialog`, `page/shortcuts`, or "" for the package's entry.
  const folderOf = (module) =>
    module.includes("/") ? module.split("/").slice(0, 2).join("/") : ""
  const tierOf = (folder) =>
    folder === "foundation/kernel"
      ? "kernel"
      : folder === "foundation/platform"
        ? "platform"
        : folder.split("/")[0] || "entry"
  const allowed = (from, to) => {
    const tier = tierOf(from)
    const target = tierOf(to)
    if (tier === "kernel") {
      return false
    }
    if (tier === "platform") {
      return target === "kernel"
    }
    if (tier === "foundation") {
      return target !== "components" && target !== "page"
    }
    if (tier === "components") {
      return target !== "components" && target !== "page"
    }
    return true
  }
  // What each foundation folder lets other folders import, from its index.
  const listed = new Map()
  const listOf = (folder) => {
    if (!listed.has(folder)) {
      const file = path.join(src, folder, "index.ts")
      const names = new Set()
      if (existsSync(file)) {
        for (const [, list] of readFileSync(file, "utf8").matchAll(
          /export\s*(?:type\s*)?\{([^}]*)\}/g
        )) {
          for (const name of list.split(",")) {
            names.add(name.trim().replace(/^type\s+/, ""))
          }
        }
      }
      listed.set(folder, names)
    }
    return listed.get(folder)
  }
  const statement =
    /^(?:import|export)\b((?:(?!^(?:import|export)\b)[^"])*?)\bfrom\s*"(\.[^"]+)"|import\(\s*"(\.[^"]+)"\s*\)/gms
  for (const file of packageSources()) {
    if (!file.startsWith(`${src}/`)) {
      continue
    }
    const module = path.relative(src, file).replace(/\.tsx?$/, "")
    const from = folderOf(module)
    if (!from) {
      continue
    }
    const text = readFileSync(file, "utf8")
    for (const match of text.matchAll(statement)) {
      const specifier = match[2] ?? match[3]
      const target = path
        .relative(src, path.resolve(path.dirname(file), specifier))
        .replace(/\.tsx?$/, "")
      const to = folderOf(target)
      if (!to || to === from) {
        continue
      }
      const report = (message) =>
        violations.push({
          file: path.relative(root, file),
          line: text.slice(0, match.index).split("\n").length,
          rule: "import-layers",
          message,
        })
      if (
        !allowed(from, to) &&
        !(`${from} -> ${to}` in importLayersAllowlist)
      ) {
        report(`${from} sits below ${to}, so it can't import it.`)
        continue
      }
      if (!to.startsWith("foundation/") || match[3]) {
        continue
      }
      if (target === to || target === `${to}/index`) {
        report(
          `import from the file in ${to}, not its index, so bundles keep their lazy chunks.`
        )
        continue
      }
      const names = (match[1].match(/\{([^}]*)\}/)?.[1] ?? "")
        .split(",")
        .map(
          (name) =>
            name
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+as\s+/)[0]
        )
        .filter(Boolean)
      for (const name of names.filter((name) => !listOf(to).has(name))) {
        report(
          `\`${name}\` isn't in ${to}/index.ts, so other folders can't import it. Add it there if it's meant to be shared.`
        )
      }
    }
  }
}

function checkExportsAtEnd() {
  const skipped = (file) =>
    !exportsAtEndCovers.some((prefix) => file.startsWith(prefix)) &&
    Object.keys(exportsAtEndSkips).some((key) =>
      key.endsWith("/") ? file.startsWith(key) : file === key
    )
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  )
    .split("\0")
    .filter(
      (file) =>
        /\.(tsx?|m?js)$/.test(file) && !file.endsWith(".d.ts") && !skipped(file)
    )
  for (const file of files) {
    const absolute = path.join(root, file)
    if (!existsSync(absolute)) {
      continue
    }
    const text = readFileSync(absolute, "utf8")
    if (!/^export\b/m.test(text)) {
      continue
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const line = (node) =>
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
    const isList = (statement) =>
      ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)
    let body = -1
    source.statements.forEach((statement, index) => {
      if (!isList(statement)) {
        body = index
      }
    })
    source.statements.forEach((statement, index) => {
      const exported = ts.canHaveModifiers(statement)
        ? ts
            .getModifiers(statement)
            ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        : false
      if (exported) {
        violations.push({
          file,
          line: line(statement),
          rule: "exports-at-end",
          message:
            "declare it without `export` and add it to the `export { }` list at the end of the file.",
        })
      } else if (isList(statement) && index < body) {
        violations.push({
          file,
          line: line(statement),
          rule: "exports-at-end",
          message: "move it to the end of the file, with the other exports.",
        })
      }
    })
  }
}

function checkPublicDocs() {
  for (const { name, declaration, file } of surface.declarations) {
    if (ts.getJSDocCommentsAndTags(declaration).length) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: lineOf(declaration),
      rule: "public-docs",
      message: `\`${name}\` is public, so give it a JSDoc comment that says what it's for.`,
    })
  }
  for (const { name, file, text } of surface.svelteComponents) {
    if (svelteComponentDoc.test(text)) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: 1,
      rule: "public-docs",
      message: `\`${name}\` is public, so give it a \`<!-- @component -->\` comment that says what it's for.`,
    })
  }
}

function checkPublicDocsPages() {
  const docs = path.join(root, "apps/docs/content/docs")
  const text = readdirSync(docs, { recursive: true })
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => readFileSync(path.join(docs, file), "utf8"))
    .join("\n")
  const named = new Set(text.match(/\b[A-Za-z_$][\w$]*\b/g))
  const isPrimitive = (declaration) => {
    if (!ts.isVariableDeclaration(declaration)) {
      return false
    }
    const { type, initializer } = declaration
    const annotated =
      type ??
      (initializer && ts.isAsExpression(initializer) ? initializer.type : null)
    return /Primitive$/.test(annotated?.getText() ?? "")
  }
  const missing = new Set()
  for (const { name, declaration, file } of surface.declarations) {
    if (
      ts.isInterfaceDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration) ||
      isPrimitive(declaration) ||
      named.has(name)
    ) {
      continue
    }
    missing.add(name)
    if (undocumentedExports.has(name)) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: lineOf(declaration),
      rule: "public-docs-pages",
      message: `\`${name}\` is public, so name it on the docs page that covers it, with what it's for.`,
    })
  }
  for (const { name, file } of surface.svelteComponents) {
    if (named.has(name)) {
      continue
    }
    missing.add(name)
    if (undocumentedExports.has(name)) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: 1,
      rule: "public-docs-pages",
      message: `\`${name}\` is public, so name it on the docs page that covers it, with what it's for.`,
    })
  }
  for (const name of undocumentedExports) {
    if (!missing.has(name)) {
      violations.push({
        file: "scripts/check-code.mjs",
        line: 1,
        rule: "public-docs-pages",
        message: `\`${name}\` is on a docs page now, or isn't checked, so remove it from \`undocumentedExports\`.`,
      })
    }
  }
}

function checkNameOnlyDocs() {
  const isMember = (node) =>
    ts.isPropertySignature(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isPropertyAssignment(node)
  const isOwner = (node) =>
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node)
  for (const file of packageSources()) {
    const text = readFileSync(file, "utf8")
    for (const { code, lineOffset } of typeScriptBlocks(file, text)) {
      const source = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true
      )
      const visit = (node, owner) => {
        const name =
          node.name &&
          (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
          node.name.text
        if (name && isMember(node) && node.jsDoc?.length) {
          const doc = node.jsDoc
            .map((jsDoc) => ts.getTextOfJSDocComment(jsDoc.comment) ?? "")
            .join(" ")
          const named = new Set([
            ...docWords(name).filter((word) => word !== "is" && word !== "has"),
            ...docWords(owner),
          ])
          const said = docWords(doc).filter((word) => !fillerWords.has(word))
          if (said.length && said.every((word) => named.has(word))) {
            violations.push({
              file: path.relative(root, file),
              line:
                source.getLineAndCharacterOfPosition(node.getStart(source))
                  .line +
                1 +
                lineOffset,
              rule: "name-only-docs",
              message: `\`${name}\`'s doc only repeats its name. Say what sets it, when it changes or what it holds.`,
            })
          }
        }
        const next = isOwner(node) ? node.name.text : owner
        ts.forEachChild(node, (child) => visit(child, next))
      }
      visit(source, "")
    }
  }
}

// The words of a name or a doc, so `readOnly` and "read-only" match: lowercase, without plural `s`.
function docWords(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 ? word.replace(/s$/, "") : word))
}

function checkStability() {
  const message = (name, count) =>
    count
      ? `\`${name}\` has ${count} stability labels, so keep one: \`@stable\` or \`@experimental\`.`
      : `\`${name}\` is public, so label it \`@stable\` or \`@experimental\` at the end of its JSDoc.`
  for (const { name, declaration, file } of surface.declarations) {
    const count = ts
      .getJSDocTags(declaration)
      .filter((tag) => stabilityLabels.includes(tag.tagName.text)).length
    if (count === 1) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: lineOf(declaration),
      rule: "stability",
      message: message(name, count),
    })
  }
  for (const { name, file, text } of surface.svelteComponents) {
    const comment = text.match(svelteComponentComment)?.[0] ?? ""
    const count = comment.match(svelteStabilityLabel)?.length ?? 0
    if (count === 1) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: 1,
      rule: "stability",
      message: message(name, count).replace(
        "its JSDoc",
        "its `<!-- @component -->` comment"
      ),
    })
  }
}

function checkInternalStability() {
  const isPublic = new Set(
    surface.declarations.map(
      ({ declaration, file }) => `${file}:${declaration.name?.text}`
    )
  )
  for (const file of packageSources().filter(
    (file) => !file.endsWith(".svelte")
  )) {
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    )
    for (const statement of sourceFile.statements) {
      const { name } = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations[0]
        : statement
      if (isPublic.has(`${file}:${name?.text}`)) {
        continue
      }
      if (
        !ts
          .getJSDocTags(statement)
          .some((tag) => stabilityLabels.includes(tag.tagName.text))
      ) {
        continue
      }
      violations.push({
        file: path.relative(root, file),
        line: lineOf(statement),
        rule: "stability",
        message: `\`${name?.text}\` isn't public, so drop its \`@stable\` or \`@experimental\` label.`,
      })
    }
  }
}

function lineOf(declaration) {
  return (
    declaration
      .getSourceFile()
      .getLineAndCharacterOfPosition(declaration.getStart()).line + 1
  )
}

function checkPublicNames() {
  const entries = publicEntries(root, "core").map(({ file }) => file)
  const program = ts.createProgram(entries, {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    customConditions: ["development"],
    strict: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const checked = new Set()
  const returnsBoolean = (signature) =>
    !!checker.getTypePredicateOfSignature(signature) ||
    !!(
      checker.getReturnTypeOfSignature(signature).flags &
      ts.TypeFlags.BooleanLike
    )
  const takesElement = (signature) => {
    const first = signature.parameters[0]
    if (!first) {
      return false
    }
    const type = checker.getTypeOfSymbol(first)
    return /\b(HTML|SVG)?Element\b/.test(
      checker.typeToString(checker.getNonNullableType(type))
    )
  }
  // A cleanup takes nothing and returns nothing.
  const returnsCleanup = (signature) =>
    checker
      .getReturnTypeOfSignature(signature)
      .getCallSignatures()
      .some(
        (cleanup) =>
          cleanup.parameters.length === 0 &&
          !!(
            checker.getReturnTypeOfSignature(cleanup).flags & ts.TypeFlags.Void
          )
      )
  const returnsObject = (signature) =>
    !!(checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Object)

  for (const entry of entries) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(entry))
    if (!module) {
      continue
    }
    for (const exported of checker.getExportsOfModule(module)) {
      const name = exported.name
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported
      const declaration = symbol.valueDeclaration
      if (
        !declaration ||
        checked.has(declaration) ||
        name in publicNameAllowlist
      ) {
        continue
      }
      checked.add(declaration)
      const isFunction =
        ts.isFunctionDeclaration(declaration) ||
        (ts.isVariableDeclaration(declaration) &&
          !!declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer)))
      if (!isFunction) {
        continue
      }
      const signatures = checker.getTypeOfSymbol(symbol).getCallSignatures()
      if (!signatures.length) {
        continue
      }
      const report = (message) =>
        violations.push({
          file: path.relative(root, declaration.getSourceFile().fileName),
          line:
            declaration
              .getSourceFile()
              .getLineAndCharacterOfPosition(declaration.getStart()).line + 1,
          rule: "public-names",
          message: `\`${name}\` ${message}`,
        })
      if (/^(is|has|supports|matches)[A-Z]/.test(name)) {
        if (!signatures.every(returnsBoolean)) {
          report(
            "doesn't return a boolean, so it can't be named like a question."
          )
        }
      } else if (signatures.every(returnsBoolean)) {
        report(
          "answers yes or no, so name it `is…`, `has…`, `supports…` or `matches…`."
        )
      }
      if (/^bind[A-Z]/.test(name)) {
        if (!signatures.every(takesElement)) {
          report("doesn't take an element first, so it isn't a `bind…`.")
        }
      } else if (
        !/^(define|create)[A-Z]/.test(name) &&
        signatures.every((s) => takesElement(s) && returnsCleanup(s))
      ) {
        report("takes an element and returns a cleanup, so name it `bind…`.")
      }
      if (/^register[A-Z]/.test(name) && !registries.includes(name)) {
        report("isn't a page-wide registry, so it can't be a `register…`.")
      }
      if (/Attrs$/.test(name) && !signatures.every(returnsObject)) {
        report("doesn't return attributes, so it isn't `…Attrs`.")
      }
    }
  }
}

function checkRendererImports() {
  const internal = /["']@ui-sdk\/core\/internal\//
  for (const name of renderers) {
    const files = execFileSync(
      "git",
      [
        "ls-files",
        "-co",
        "--exclude-standard",
        `packages/${name}/src`,
        `packages/${name}/test`,
      ],
      {
        cwd: root,
        encoding: "utf8",
      }
    )
      .split("\n")
      .filter(
        (file) =>
          /\.(ts|tsx|vue|svelte)$/.test(file) &&
          existsSync(path.join(root, file))
      )
    for (const file of files) {
      readFileSync(path.join(root, file), "utf8")
        .split("\n")
        .forEach((text, index) => {
          if (internal.test(text)) {
            violations.push({
              file,
              line: index + 1,
              rule: "renderer-imports",
              message:
                "import it from `@ui-sdk/core/renderer` or a public entry, not `@ui-sdk/core/internal`.",
            })
          }
        })
    }
  }
}

function checkNuxtImports() {
  const nuxtImport =
    /\b(?:from|import)\s*\(?\s*["'](?:nuxt|@nuxt\/[\w-]+|#app|#imports)(?:\/[^"']*)?["']/
  for (const file of packageSources()) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        if (nuxtImport.test(text)) {
          violations.push({
            file: path.relative(root, file),
            line: index + 1,
            rule: "nuxt-imports",
            message:
              "only the Nuxt module in `packages/vue/nuxt` may import Nuxt.",
          })
        }
      })
  }
}

function checkApiFiles() {
  const kebab = (name) =>
    name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
  const files = packageSources().filter((file) =>
    file.startsWith(path.join(root, "packages/core/src/"))
  )
  for (const file of files) {
    if (file.endsWith("-api.ts")) {
      continue
    }
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    )
    for (const statement of source.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        statement.moduleSpecifier ||
        !statement.exportClause
      ) {
        continue
      }
      if (!ts.isNamedExports(statement.exportClause)) {
        continue
      }
      for (const element of statement.exportClause.elements) {
        const name = element.name.text
        if (element.isTypeOnly || !/^[a-z]\w*Api$/.test(name)) {
          continue
        }
        if (
          path.basename(file, ".ts") === kebab(name.slice(0, -"Api".length))
        ) {
          continue
        }
        violations.push({
          file: path.relative(root, file),
          line:
            source.getLineAndCharacterOfPosition(element.getStart(source))
              .line + 1,
          rule: "api-files",
          message: `move \`${name}\` into \`${kebab(name.slice(0, -"Api".length))}-api.ts\`, or rename this file to end in \`-api.ts\`.`,
        })
      }
    }
  }
}

function checkNamedApi() {
  const aliasedApi = /^type (\w+Api)\b[^=]*=\s*ReturnType<\s*typeof \w+Api\b/
  const files = packageSources().filter((file) =>
    file.startsWith(path.join(root, "packages/core/src/"))
  )
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        const name = text.match(aliasedApi)?.[1]
        if (!name) {
          return
        }
        violations.push({
          file: path.relative(root, file),
          line: index + 1,
          rule: "named-api",
          message: `declare \`${name}\` as an interface that extends the return type, so declaration files name it instead of repeating it.`,
        })
      })
  }
}

function checkInternalExports() {
  for (const { name, declaration, file } of surface.declarations) {
    if (
      !ts
        .getJSDocTags(declaration)
        .some((tag) => tag.tagName.text === "internal")
    ) {
      continue
    }
    violations.push({
      file: path.relative(root, file),
      line: lineOf(declaration),
      rule: "internal-exports",
      message: `\`${name}\` is public but says \`@internal\`: export it from a module that isn't an entry, or drop the tag.`,
    })
  }
}

function checkEntryTypes() {
  const checker = surface.program.getTypeChecker()
  const coreSource = path.join(root, "packages/core/src/")
  const moduleOf = (file) =>
    checker.getSymbolAtLocation(surface.program.getSourceFile(file))
  const resolve = (symbol) =>
    symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  const isCoreType = (symbol) =>
    !!symbol &&
    !(symbol.flags & ts.SymbolFlags.Value) &&
    !!symbol.declarations?.[0]?.getSourceFile().fileName.startsWith(coreSource)
  // A package's entries but its root, like `{ name: "accordion", file }`.
  const subpathEntries = (pkg) =>
    publicEntries(root, pkg).flatMap(({ subpath, file }) =>
      subpath === "." ? [] : [{ name: subpath.slice(2), file }]
    )

  const coreTypes = new Map()
  for (const { name, file } of subpathEntries("core")) {
    const types = new Map()
    for (const exported of checker.getExportsOfModule(moduleOf(file))) {
      const symbol = resolve(exported)
      if (isCoreType(symbol)) {
        types.set(exported.name, symbol)
      }
    }
    coreTypes.set(name, types)
  }
  for (const renderer of renderers) {
    for (const { file } of publicEntries(root, renderer)) {
      checkNoStar(file)
    }
    for (const { name, file } of subpathEntries(renderer)) {
      const coreName = coreEntryOf[name]?.entry ?? name
      if (coreTypes.has(coreName)) {
        checkEntry(file, coreName, coreTypes.get(coreName))
      }
    }
  }

  // `export type *` from core also exports core's functions and primitives,
  // as names only types can use, and a name the entry takes hides core's type of it.
  function checkNoStar(file) {
    const source = surface.program.getSourceFile(file)
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.exportClause) {
        continue
      }
      if (!statement.moduleSpecifier?.text.startsWith("@ui-sdk/core")) {
        continue
      }
      violations.push({
        file: path.relative(root, file),
        line:
          source.getLineAndCharacterOfPosition(statement.getStart(source))
            .line + 1,
        rule: "entry-types",
        message: `name what to re-export from \`${statement.moduleSpecifier.text}\` one by one.`,
      })
    }
  }

  function checkEntry(file, coreName, expected) {
    const source = surface.program.getSourceFile(file)
    const specifier = `@ui-sdk/core/${coreName}`
    const report = (node, message) =>
      violations.push({
        file: path.relative(root, file),
        line: node
          ? source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
          : 1,
        rule: "entry-types",
        message,
      })
    const entryExports = new Map(
      checker
        .getExportsOfModule(moduleOf(file))
        .map((symbol) => [symbol.name, resolve(symbol)])
    )
    // The name is taken when the entry exports something else under it, like the `Toast` component.
    const isTaken = (name, symbol) =>
      entryExports.has(name) && entryExports.get(name) !== symbol
    const coreNameOf = new Map(
      [...expected].map(([name, symbol]) => [symbol, name])
    )
    const reexported = new Set()
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.exportClause) {
        continue
      }
      if (!ts.isNamedExports(statement.exportClause)) {
        continue
      }
      const from = statement.moduleSpecifier?.text
      for (const element of statement.exportClause.elements) {
        const symbol = resolve(
          from
            ? checker.getSymbolAtLocation(element.name)
            : checker.getExportSpecifierLocalTargetSymbol(element)
        )
        if (!isCoreType(symbol)) {
          continue
        }
        const exported = element.name.text
        const coreType = coreNameOf.get(symbol)
        if (!coreType) {
          report(
            element,
            `\`${exported}\` is a type of another core entry. Export it from \`${specifier}\` in core if this component needs it, or leave it out.`
          )
          continue
        }
        if (
          from !== specifier ||
          !(statement.isTypeOnly || element.isTypeOnly)
        ) {
          report(
            element,
            `re-export \`${exported}\` with \`export type { } from "${specifier}"\`.`
          )
        } else if (exported !== coreType && !isTaken(coreType, symbol)) {
          report(
            element,
            `re-export \`${coreType}\` under its own name, since nothing else here takes it.`
          )
        }
        reexported.add(coreType)
      }
    }
    const missing = [...expected].flatMap(([type, symbol]) =>
      reexported.has(type) || isTaken(type, symbol) ? [] : [type]
    )
    if (missing.length) {
      report(
        undefined,
        `re-export ${missing.map((type) => `\`${type}\``).join(", ")} from \`${specifier}\`, which exports ${missing.length === 1 ? "it" : "them"}.`
      )
    }
  }
}
