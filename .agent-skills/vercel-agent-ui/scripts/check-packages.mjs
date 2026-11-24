// Installs the packed packages in a scratch app and typechecks every public
// entry as a strict consumer would. `pnpm typecheck` reads the sources; this
// reads the declarations the build emits, which can break while the sources
// pass, like a type that names something its file can't reach.
//
//   pnpm check:packages           Checks the current builds in packages/*/dist.
//   pnpm check:packages --build   Runs `pnpm build` and `pnpm docs:packages` first.
//
// `pnpm pack` packs each package as it's published, with `publishConfig`'s
// exports pointing at `dist`, and every tarball is unpacked into the app's
// node_modules before any is checked. The frameworks are linked from the
// workspace, so it never touches the network. For each package, a generated
// file imports every subpath of its packed `exports`, except `./package.json`
// and patterns. Every `@ui-sdk` module a packed declaration imports must be
// an entry its package publishes: one only the workspace resolves, like
// `@ui-sdk/core/internal/*`, fails in an app, even in a declaration no entry
// reaches here. The consumers in `scripts/package-consumers/<package>/` are
// checked each on its own, so a consumer sees only what its imports bring,
// not a global another entry declares, like web's HTMLElementTagNameMap. An
// entry whose `types` file isn't in the tarball is listed with that path: a
// build that stopped or a wrong `publishConfig.exports` path, which look the
// same from here.
// Node then imports every core, React and Vue entry, as an app's server would.
// Every relative import in a packed module must name a file, since Node's
// loader takes neither a folder nor a path without its extension. That covers
// the packages Node can't import here, like Svelte's.
//
// TypeScript runs with `strict`, `exactOptionalPropertyTypes` and
// `skipLibCheck: false`, so an error in a shipped declaration fails here as it
// does in the strictest app that checks its libraries. An error prints once,
// under the first package that reaches it.
// Every package is unpacked side by side, as an app installs an adapter with
// `@ui-sdk/core` beside it. A package that needs another `@ui-sdk` package
// takes it as a peer, never a dependency, so an app ends up with one copy.
// Every package ships `docs/llms.txt`, which the setup prompts and the skill
// point agents at, from `pnpm docs:packages`.
//
// The release workflow and CI run it.
import { execFileSync, spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import ts from "typescript"

const root = path.resolve(import.meta.dirname, "..")
const consumersDir = path.join(root, "scripts/package-consumers")
const { values: flags } = parseArgs({
  options: { build: { type: "boolean", default: false } },
})

// What the emitted declarations import besides @ui-sdk. Each links to the
// workspace's copy, and TypeScript follows the link, so their own
// dependencies, like csstype or @vue/runtime-dom, resolve from there too.
const peers = [
  "react",
  "react-dom",
  "@types/react",
  "@types/react-dom",
  "vue",
  "svelte",
  "solid-js",
  "@solidjs/web",
  "@nuxt/kit",
  "@nuxt/schema",
  "@types/node",
]

const compilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  skipLibCheck: false,
  module: "esnext",
  moduleResolution: "bundler",
  target: "es2022",
  lib: ["dom", "dom.iterable", "es2022"],
  // Only the types a file imports, so a declaration that leans on another
  // framework's globals fails instead of passing because they happen to load.
  types: [],
}
// Entries outside `src`, like `@ui-sdk/vue/nuxt`, run in a build tool on
// Node. Their tools' own declarations aren't clean without `skipLibCheck`,
// which those apps set, so only errors in ui-sdk's files count.
const toolOptions = { ...compilerOptions, lib: ["es2022"], types: ["node"] }
const frameworkOptions = {
  // Core's consumers ship primitives, so their declarations have to emit too.
  core: { declaration: true, emitDeclarationOnly: true },
  react: { jsx: "react-jsx" },
  // Solid 2 ships its JSX runtime in @solidjs/web, not solid-js.
  solid: { jsx: "preserve", jsxImportSource: "@solidjs/web" },
}

if (flags.build) {
  for (const script of ["build", "docs:packages"]) {
    const run = spawnSync("pnpm", [script], { cwd: root, stdio: "inherit" })
    if (run.status !== 0) {
      process.exit(run.status ?? 1)
    }
  }
}

const names = readdirSync(path.join(root, "packages")).filter((name) =>
  existsSync(path.join(root, "packages", name, "package.json"))
)
const unbuilt = names.filter(
  (name) => !existsSync(path.join(root, "packages", name, "dist"))
)
if (unbuilt.length) {
  console.error(
    `No dist in ${unbuilt.map((name) => `packages/${name}`).join(", ")}. Run \`pnpm build\`, or pass --build.`
  )
  process.exit(1)
}
// A missing peer would become a dangling link and a confusing TS2307.
const uninstalled = peers.filter(
  (peer) => !existsSync(path.join(root, "node_modules", peer))
)
if (uninstalled.length) {
  console.error(
    `No ${uninstalled.join(", ")} in node_modules. Run \`pnpm install\`.`
  )
  process.exit(1)
}

// Resolved, since TypeScript reports files by their real path.
const app = realpathSync(mkdtempSync(path.join(tmpdir(), "ui-sdk-packages-")))
// TypeScript's messages name files by their path in the app too.
const escapedApp = app.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
const appPaths = new RegExp(`${escapedApp}/[^'"\\s]+`, "g")
let errorCount = 0
let missingCount = 0
try {
  for (const peer of peers) {
    const link = path.join(app, "node_modules", peer)
    mkdirSync(path.dirname(link), { recursive: true })
    symlinkSync(path.join(root, "node_modules", peer), link, "dir")
  }
  // Every package goes in first, since each one's declarations and
  // consumers can import any other.
  const manifests = new Map(names.map((name) => [name, install(name)]))
  const reported = new Set()
  for (const [name, manifest] of manifests) {
    const found = checkPackage(name, manifest, manifests, reported)
    errorCount += found.errors
    missingCount += found.missing
  }
} finally {
  rmSync(app, { recursive: true, force: true })
}

if (errorCount || missingCount) {
  const problems = [
    ...(errorCount ? [count(errorCount, "error")] : []),
    ...(missingCount ? [count(missingCount, "missing declaration")] : []),
  ]
  console.error(`\n${problems.join(" and ")} in the packed packages.`)
  process.exit(1)
}
console.log(
  "\nEvery packed entry typechecks, every relative import names a file, and every core, React and Vue entry imports in Node."
)

// Packs a package as it's published and unpacks it into the app's node_modules.
function install(name) {
  const packageDir = path.join(root, "packages", name)
  const output = execFileSync(
    "pnpm",
    ["pack", "--pack-destination", path.join(app, "tarballs")],
    {
      cwd: packageDir,
      encoding: "utf8",
    }
  )
  const { name: packageName } = JSON.parse(
    readFileSync(path.join(packageDir, "package.json"), "utf8")
  )
  const target = path.join(app, "node_modules", packageName)
  mkdirSync(target, { recursive: true })
  execFileSync("tar", [
    "-xzf",
    output.trim().split("\n").at(-1),
    "-C",
    target,
    "--strip-components=1",
  ])
  return JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"))
}

// Typechecks a package's entries and consumers and prints what it found.
// Returns how many errors and missing declarations it printed.
function checkPackage(name, manifest, manifests, reported) {
  const { subpaths: listed, missing } = listEntries(manifest)
  const toolSubpaths = toolEntries(name)
  const tools = listed.filter((subpath) => toolSubpaths.includes(subpath))
  const subpaths = listed.filter((subpath) => !tools.includes(subpath))
  const consumers = copyConsumers(name)
  const errors = [
    ...findMissingDocs(name, manifest),
    ...findBundledSiblings(name, manifest),
    ...findUnpublishedImports(name, manifest, manifests),
    ...findUnresolvedImports(name, manifest),
    ...findImportFailures(name, manifest, subpaths),
  ]
  const checks = [
    writeEntryImports(name, manifest.name, subpaths, "entries.ts"),
    ...consumers,
  ].map((file) => typecheck(name, file))
  if (tools.length) {
    checks.push(
      typecheckTool(writeEntryImports(name, manifest.name, tools, "tools.ts"))
    )
  }
  let repeated = 0
  for (const diagnostics of checks) {
    for (const diagnostic of diagnostics) {
      const key = `${diagnostic.file?.fileName}:${diagnostic.start}:${diagnostic.code}`
      if (reported.has(key)) {
        repeated++
      } else {
        errors.push(describe(diagnostic))
      }
      reported.add(key)
    }
  }

  const checked = [
    `${listed.length + missing.length} entries`,
    ...(consumers.length ? [count(consumers.length, "consumer")] : []),
  ]
  const found = [
    ...(missing.length ? [count(missing.length, "missing declaration")] : []),
    count(errors.length, "error"),
    ...(repeated ? [`${repeated} more reported above`] : []),
  ]
  console.log(`${manifest.name}: ${checked.join(", ")}. ${found.join(", ")}.`)
  if (missing.length) {
    console.log(
      "  Declarations missing from the packed package (a build that stopped, or a wrong publishConfig.exports path):"
    )
    for (const { subpath, types } of missing) {
      console.log(`    ${subpath}: ${types}`)
    }
  }
  for (const error of errors) {
    console.log(`  ${error}`)
  }
  return { errors: errors.length, missing: missing.length }
}

// The subpaths a consumer can import, and those whose `types` file isn't in
// the packed package. Those are listed, not imported, since importing each
// would only add an error in the generated file.
function listEntries(manifest) {
  const subpaths = []
  const missing = []
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (
      subpath === "./package.json" ||
      subpath.endsWith(".css") ||
      subpath.includes("*")
    ) {
      continue
    }
    // An entry with no `types` at all is imported anyway, so TypeScript says what's wrong.
    const types = typeof target === "string" ? target : target.types
    if (
      !types ||
      existsSync(path.join(app, "node_modules", manifest.name, types))
    ) {
      subpaths.push(subpath)
    } else {
      missing.push({ subpath, types })
    }
  }
  return { subpaths, missing }
}

function findMissingDocs(name, manifest) {
  if (
    existsSync(path.join(app, "node_modules", manifest.name, "docs/llms.txt"))
  ) {
    return []
  }
  return [
    `packages/${name} packs no docs/llms.txt. Run \`pnpm docs:packages\`.`,
  ]
}

// Each `@ui-sdk` package the packed manifest lists as a dependency, which
// would install a second copy beside the one the app installs.
function findBundledSiblings(name, manifest) {
  return Object.keys(manifest.dependencies ?? {})
    .filter((dependency) => dependency.startsWith("@ui-sdk/"))
    .map(
      (dependency) =>
        `packages/${name}/package.json lists ${dependency} in dependencies; make it a peer.`
    )
}

// Each `@ui-sdk` module the package's declarations import that isn't an entry
// of its package, once per file.
function findUnpublishedImports(name, manifest, manifests) {
  const entries = new Map(
    [...manifests.values()].map((packed) => [
      packed.name,
      Object.keys(packed.exports),
    ])
  )
  const packageImport =
    /(?:\bfrom\s*|\bimport\s*\(\s*)["'](@ui-sdk\/[^/"']+)(\/[^"']+)?["']/g
  const packageDir = path.join(app, "node_modules", manifest.name)
  const problems = new Set()
  for (const file of readdirSync(packageDir, { recursive: true })) {
    if (!file.endsWith(".d.ts")) {
      continue
    }
    const source = readFileSync(path.join(packageDir, file), "utf8")
    for (const [, target, subpath = ""] of source.matchAll(packageImport)) {
      if (!entries.get(target)?.includes(`.${subpath}`)) {
        problems.add(
          `packages/${name}/${file} imports ${target}${subpath}, which ${target} doesn't publish.`
        )
      }
    }
  }
  return [...problems]
}

// Each relative import in a packed module that doesn't name a file. A bundler
// resolves `./parts` to `./parts.js` or `./parts/index.js`; Node throws.
function findUnresolvedImports(name, manifest) {
  const relativeImport =
    /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g
  const packageDir = path.join(app, "node_modules", manifest.name)
  const problems = new Set()
  for (const file of readdirSync(packageDir, { recursive: true })) {
    if (!/\.(m?js|jsx|svelte)$/.test(file)) {
      continue
    }
    const source = readFileSync(path.join(packageDir, file), "utf8")
    for (const [, specifier] of source.matchAll(relativeImport)) {
      const target = path.resolve(packageDir, path.dirname(file), specifier)
      if (!statSync(target, { throwIfNoEntry: false })?.isFile()) {
        problems.add(
          `packages/${name}/${file} imports ${specifier}, which isn't a file in the package.`
        )
      }
    }
  }
  return [...problems]
}

// Each entry that throws when Node imports it from the packed package, as an
// app's server does. Svelte ships components to compile, web components need
// a DOM, and Solid's server build comes through the `solid` condition.
function findImportFailures(name, manifest, subpaths) {
  if (!["core", "react", "vue"].includes(name)) {
    return []
  }
  const specifiers = subpaths.map((subpath) =>
    path.posix.join(manifest.name, subpath)
  )
  const file = path.join(app, name, "imports.mjs")
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    `const failed = []
for (const specifier of ${JSON.stringify(specifiers)}) {
  try {
    await import(specifier)
  } catch (error) {
    failed.push([specifier, String(error?.message ?? error).split("\\n")[0]])
  }
}
console.log(JSON.stringify(failed))
`
  )
  const output = execFileSync("node", [file], { cwd: app, encoding: "utf8" })
  return JSON.parse(output).map(
    ([specifier, message]) =>
      `${specifier} throws when Node imports it: ${message}`
  )
}

// The subpaths whose source in the workspace's manifest is outside `src`.
function toolEntries(name) {
  const { exports } = JSON.parse(
    readFileSync(path.join(root, "packages", name, "package.json"), "utf8")
  )
  return Object.entries(exports)
    .filter(
      ([, target]) => typeof target === "string" && !target.startsWith("./src/")
    )
    .map(([subpath]) => subpath)
}

// Writes `<package>/<fileName>`, which imports each entry as a namespace and
// exports them all, so no import goes unused.
function writeEntryImports(name, packageName, subpaths, fileName) {
  const file = path.join(app, name, fileName)
  const lines = subpaths.map(
    (subpath, index) =>
      `import * as entry${index} from "${path.posix.join(packageName, subpath)}"`
  )
  lines.push(
    `export const entries = [${subpaths.map((_, index) => `entry${index}`).join(", ")}]`
  )
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${lines.join("\n")}\n`)
  return file
}

// Copies the package's hand-written consumers next to its entries file, so
// they import the packed package, not the workspace's sources.
function copyConsumers(name) {
  const source = path.join(consumersDir, name)
  if (!existsSync(source)) {
    return []
  }
  cpSync(source, path.join(app, name), { recursive: true })
  return readdirSync(source, { recursive: true })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.join(app, name, file))
}

// Typechecks a file in a program of its own, with what it imports.
function typecheck(name, file) {
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    { ...compilerOptions, ...frameworkOptions[name] },
    app
  )
  return [
    ...errors,
    ...ts.getPreEmitDiagnostics(ts.createProgram([file], options)),
  ]
}

function typecheckTool(file) {
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    toolOptions,
    app
  )
  const ours = path.join(app, "node_modules/@ui-sdk/")
  return [
    ...errors,
    ...ts.getPreEmitDiagnostics(ts.createProgram([file], options)),
  ].filter(
    ({ file: source }) =>
      !source || source.fileName === file || source.fileName.startsWith(ours)
  )
}

function describe(diagnostic) {
  const message = ts
    .flattenDiagnosticMessageText(diagnostic.messageText, "\n    ")
    .replace(appPaths, (file) => repoPath(file))
  if (!diagnostic.file) {
    return `error TS${diagnostic.code}: ${message}`
  }
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start ?? 0
  )
  return `${repoPath(diagnostic.file.fileName)}:${line + 1}:${character + 1} - error TS${diagnostic.code}: ${message}`
}

// Where a file is in the repo: a packed file is the one in `packages/<name>`,
// and a copied consumer the one in `scripts/package-consumers`.
function repoPath(file) {
  const inApp = path.relative(app, file)
  if (inApp.startsWith("..")) {
    return path.relative(root, file)
  }
  const packed = inApp.match(/^node_modules\/@ui-sdk\/([^/]+)\/(.+)$/)
  if (packed) {
    return path.join("packages", packed[1], packed[2])
  }
  if (["entries.ts", "tools.ts"].includes(path.basename(inApp))) {
    return `${inApp} (generated)`
  }
  return path.join(path.relative(root, consumersDir), inApp)
}

function count(amount, noun) {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`
}
