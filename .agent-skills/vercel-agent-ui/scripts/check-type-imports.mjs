// Fails on `import { type X } from "@ui-sdk/core/combobox"` in a package's
// sources. Under `verbatimModuleSyntax` it compiles to
// `import "@ui-sdk/core/combobox"`, a side-effect import that pulls that
// entry's module graph into the bundle, `import()` chunks included, even
// though only a type was wanted. `import type { X }` compiles to nothing.
// Runs as part of `pnpm typecheck`. Relative imports inside a package aren't
// checked yet: converting core's changes how esbuild orders and splits its
// modules, so it needs its own size pass.
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
// `import { type A, type B } from "pkg"` and the same for `export`, with the specifier.
const namedTypes =
  /\b(?:import|export)\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g

const failures = []
for (const file of sourceFiles(path.join(root, "packages"))) {
  const source = readFileSync(file, "utf8")
  for (const match of source.matchAll(namedTypes)) {
    const [statement, list, specifier] = match
    const names = list
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
    const isTypeOnly =
      names.length > 0 && names.every((name) => /^type\s/.test(name))
    if (!isTypeOnly || specifier.startsWith(".")) {
      continue
    }
    const line = source.slice(0, match.index).split("\n").length
    const keyword = statement.startsWith("import") ? "import" : "export"
    failures.push(
      `${path.relative(root, file)}:${line}: use \`${keyword} type { … }\` from "${specifier}".`
    )
  }
}

if (failures.length) {
  console.error(
    `Type-only ${failures.length === 1 ? "import keeps" : "imports keep"} a side-effect import under verbatimModuleSyntax:\n${failures.join("\n")}`
  )
  process.exitCode = 1
}

// Every .ts and .tsx file under each package's src.
function sourceFiles(packagesDir) {
  const packages = readdirSync(packagesDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory()
  )
  return packages.flatMap(({ name }) => {
    const src = path.join(packagesDir, name, "src")
    if (!existsSync(src)) {
      return []
    }
    return readdirSync(src, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name))
  })
}
