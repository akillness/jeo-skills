// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test, vi } from "vitest"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import packageJson from "../package.json"

// A change reports how the user caused it from the last key or pointer press,
// so the document listeners must be in place before anyone can press a part.
// Every primitive whose imports reach `kernel/modality` reads them, and each one
// installs them by a microtask after one of its parts is bound, before any
// press can come, on a page with nothing else on it. The census comes from the
// imports, so a primitive that stops reaching `kernel/modality` leaves it.

type Slots = Record<string, { bind?: unknown; connect?: unknown }>

const root = path.resolve(import.meta.dirname, "..")
const modality = path.join(root, "src/foundation/kernel/modality.ts")

function runtimeImports(file: string) {
  const text = readFileSync(file, "utf8")
  const imports: string[] = []
  for (const [statement, specifier] of text.matchAll(
    /^(?:import|export)[^"]*?from\s*"(\.{1,2}\/[^"]+)"/gm
  )) {
    if (/^(?:import|export) type\b/.test(statement)) {
      continue
    }
    const base = path.resolve(path.dirname(file), specifier)
    const resolved = [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
    ].find(existsSync)
    if (resolved) {
      imports.push(resolved)
    }
  }
  return imports
}

function reaches(
  file: string,
  target: string,
  seen = new Set<string>()
): boolean {
  if (file === target) {
    return true
  }
  if (seen.has(file)) {
    return false
  }
  seen.add(file)
  return runtimeImports(file).some((next) => reaches(next, target, seen))
}

const entries = Object.entries(packageJson.exports as Record<string, string>)
  .filter(([entry]) => entry !== "." && !entry.includes("*"))
  .map(([entry, file]) => [entry.slice(2), path.join(root, file)] as const)
  .filter(([, file]) => reaches(file, modality))

// Which exports are primitives, and their slots, read once through a wrapped
// `definePrimitive`. The tests import the real modules again after a reset,
// so input tracking starts uninstalled in each.
const defined = new Map<unknown, Slots>()
vi.doMock(
  import("../src/foundation/kernel/primitive"),
  async (importOriginal) => {
    const kernel = await importOriginal()
    const definePrimitive: typeof kernel.definePrimitive = (definition) => {
      const primitive = kernel.definePrimitive(definition)
      defined.set(
        primitive,
        definition.slots((slot) => slot)
      )
      return primitive
    }
    return { ...kernel, definePrimitive }
  }
)
const census: [entry: string, name: string, slot: string, file: string][] = []
for (const [entry, file] of entries) {
  const exported: Record<string, unknown> = await import(file)
  for (const [name, value] of Object.entries(exported)) {
    const slots = defined.get(value)
    if (!slots) {
      continue
    }
    const slot =
      Object.keys(slots).find(
        (key) => !slots[key].bind && !slots[key].connect
      ) ?? Object.keys(slots)[0]
    census.push([entry, name, slot, file])
  }
}
vi.doUnmock("../src/foundation/kernel/primitive")

// Primitives whose every part binds, and whose binding needs a real control.
const boundTags: Record<string, string> = {
  form: "form",
  input: "input",
  textarea: "textarea",
}

test("the census holds the primitives that report input sources", () => {
  const names = census.map(([entry, name]) => `${entry} ${name}`)
  expect(names).toContain("switch switchPrimitive")
  expect(names).toContain("collapsible collapsible")
})

test.each(census)(
  "%s %s tracks input once its %s part is bound",
  async (_, name, slot, file) => {
    vi.resetModules()
    const addEventListener = vi.spyOn(document, "addEventListener")
    try {
      const exported: Record<string, unknown> = await import(file)
      // The kernel loaded after the reset, with the modules the primitive loaded.
      const { bind } = await import("../src/foundation/kernel/part")
      const instance = (
        exported[name] as (options: { id: string }) => PrimitiveInstance
      )({ id: "census" })
      const el = document.body.appendChild(
        document.createElement(boundTags[name] ?? "div")
      )
      bind(instance.part(slot, {}), el)
      await Promise.resolve()
      const listening = addEventListener.mock.calls.map(
        ([type, , options]) => `${type} ${options}`
      )
      expect(listening).toContain("keydown true")
    } finally {
      addEventListener.mockRestore()
      document.body.replaceChildren()
    }
  }
)
