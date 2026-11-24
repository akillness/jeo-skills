import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The package has no root entry, so a module without an `exports` entry can't
// be imported at all. Modules other modules import are internal and need none.
const packageDir = path.join(import.meta.dirname, "..")
const sourceDir = path.join(packageDir, "src")
const manifest = JSON.parse(
  readFileSync(path.join(packageDir, "package.json"), "utf8")
)
const modules = readdirSync(sourceDir).filter((file) => /\.tsx?$/.test(file))
const nameOf = (file: string) => file.replace(/\.tsx?$/, "")

function importedByOthers() {
  const imported = new Set<string>()
  for (const file of modules) {
    const code = readFileSync(path.join(sourceDir, file), "utf8")
    for (const [, specifier] of code.matchAll(/from "\.\/([\w-]+)"/g)) {
      imported.add(specifier)
    }
  }
  return imported
}

describe("package exports", () => {
  test("every module is exported or used by another module", () => {
    const exported = new Set(
      Object.keys(manifest.exports).map((key) => key.slice(2))
    )
    const internal = importedByOthers()
    const unreachable = modules
      .map(nameOf)
      .filter((name) => !exported.has(name) && !internal.has(name))
    expect(
      unreachable,
      "modules with no exports entry that nothing imports"
    ).toEqual([])
  })

  test("every export points at a module, and the published map lists the same ones", () => {
    for (const target of Object.values<string>(manifest.exports)) {
      expect(existsSync(path.join(packageDir, target)), target).toBe(true)
    }
    expect(
      Object.keys(manifest.publishConfig.exports).filter(
        (key) => key !== "./package.json"
      )
    ).toEqual(Object.keys(manifest.exports))
  })
})
