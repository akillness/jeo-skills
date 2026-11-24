// The public surface: every export of core's public entries and of every
// adapter entry in a package.json's `exports`, each once, at its declaration,
// and the Svelte components those entries export. `scripts/check-code.mjs`
// checks it (`public-docs`, `stability`), and `codemods/stability-labels.mjs`
// labels it.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

// Entries that aren't public API: core's entry for framework renderers.
const notPublic = ["./renderer"]

// Packages whose public entries make up the surface.
const documentedPackages = ["core", "react", "solid", "vue", "svelte", "web"]

/**
 * `declarations` holds each export's first name, its declaration and its file.
 * `svelteComponents` holds each Svelte component an entry exports, with its
 * file's text. Anything declared outside the repo's packages documents itself,
 * so it isn't listed. `program` holds every entry, for checks that read more.
 */
function publicExports(root) {
  const entries = documentedPackages.flatMap((name) =>
    publicEntries(root, name).map(({ file }) => file)
  )
  const program = ts.createProgram(entries, {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    customConditions: ["development"],
    jsx: ts.JsxEmit.Preserve,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const packages = path.join(root, "packages")
  const seen = new Set()
  const declarations = []
  const svelteComponents = []
  for (const entry of entries) {
    const sourceFile = program.getSourceFile(entry)
    collectSvelteComponents(sourceFile)
    const module = checker.getSymbolAtLocation(sourceFile)
    if (!module) {
      continue
    }
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported
      const declaration = symbol.declarations?.[0]
      // Svelte components resolve to Svelte's own types, and are collected above.
      const file = declaration?.getSourceFile().fileName
      if (
        !file ||
        !file.startsWith(packages) ||
        file.includes("node_modules")
      ) {
        continue
      }
      const key = `${file}:${declaration.pos}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      declarations.push({ name: exported.name, declaration, file })
    }
  }
  return { declarations, svelteComponents, program }

  // An entry's `export { default as Dialog } from "./dialog/dialog.svelte"` names a component file.
  // A specifier like "./shortcuts.svelte" names a `.svelte.ts` module, which the checker reads.
  function collectSvelteComponents(sourceFile) {
    for (const statement of sourceFile.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        !statement.moduleSpecifier?.text.endsWith(".svelte")
      ) {
        continue
      }
      const file = path.join(
        path.dirname(sourceFile.fileName),
        statement.moduleSpecifier.text
      )
      if (!existsSync(file) || seen.has(file)) {
        continue
      }
      seen.add(file)
      const name = statement.exportClause?.elements[0]?.name.text
      svelteComponents.push({ name, file, text: readFileSync(file, "utf8") })
    }
  }
}

// A package's public entries in its package.json `exports`, like
// `{ subpath: "./accordion", file }`, without patterns like `./internal/*`.
function publicEntries(root, name) {
  const { exports } = JSON.parse(
    readFileSync(path.join(root, "packages", name, "package.json"), "utf8")
  )
  return Object.entries(exports)
    .filter(
      ([subpath, target]) =>
        typeof target === "string" &&
        /\.tsx?$/.test(target) &&
        !notPublic.includes(subpath) &&
        !subpath.includes("*")
    )
    .map(([subpath, target]) => ({
      subpath,
      file: path.join(root, "packages", name, target),
    }))
}

export { documentedPackages, publicEntries, publicExports }
