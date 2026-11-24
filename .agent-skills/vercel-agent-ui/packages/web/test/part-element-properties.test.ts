// @vitest-environment jsdom
// `HTMLElementTagNameMap` lists each part element's properties by hand in
// events.ts, so this reads that list and checks it against the accessors the
// elements define, both ways, and it can't drift from the runtime.
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { beforeAll, expect, test } from "vitest"

const source = path.resolve(import.meta.dirname, "../src")

// Each `"ui-…": UiPartElement<typeof x, "slot", "a" | "b", "c", Events>` entry,
// with the names in its `Attributes` and `Properties` lists.
const entry =
  /"(ui-[a-z-]+)":\s*UiPartElement<\s*typeof\s+\w+,\s*"[^"]+"((?:\s*,\s*(?:"[^"]+"(?:\s*\|\s*"[^"]+")*|never))*)(?:\s*,\s*(?:\w+|\{\}))?\s*,?\s*>/g

function typedParts() {
  const events = readFileSync(path.join(source, "events.ts"), "utf8")
  return [...events.matchAll(entry)].map(([, tag, lists]) => ({
    tag,
    names: [...lists.matchAll(/"([^"]+)"/g)].map(([, name]) => name),
  }))
}

// Every entry, so loading them takes longer than a hook's default timeout on a busy machine.
beforeAll(async () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  const entries = readdirSync(path.join(source, "entries"))
  await Promise.all(
    entries.map(
      (file) => import(/* @vite-ignore */ path.join(source, "entries", file))
    )
  )
}, 120_000)

test("every part element in HTMLElementTagNameMap is defined", () => {
  const parts = typedParts()
  expect(parts.length).toBeGreaterThan(100)
  expect(
    parts.map(({ tag }) => tag).filter((tag) => !customElements.get(tag))
  ).toEqual([])
})

test("every typed part property exists at runtime, and every runtime one is typed", () => {
  const missing: string[] = []
  const untyped: string[] = []
  for (const { tag, names } of typedParts()) {
    const proto = Object.getPrototypeOf(document.createElement(tag))
    for (const name of names) {
      if (!(name in proto)) {
        missing.push(`${tag}.${name}`)
      }
    }
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (
        Object.getOwnPropertyDescriptor(proto, name)?.get &&
        !names.includes(name)
      ) {
        untyped.push(`${tag}.${name}`)
      }
    }
  }
  expect({ missing, untyped }).toEqual({ missing: [], untyped: [] })
})
