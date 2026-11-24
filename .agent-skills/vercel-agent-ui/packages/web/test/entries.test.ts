// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"

const root = path.resolve(import.meta.dirname, "..")
const manifest = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
)
const react = JSON.parse(
  readFileSync(path.join(root, "../react/package.json"), "utf8")
)
const entries = readdirSync(path.join(root, "src/entries")).map((file) =>
  file.replace(/\.ts$/, "")
)
// React entries for helpers, not components. Web serves them from its root, the agent bridge from its own
// `./agent`, the change history from `./history`, and the gesture blocks from `@ui-sdk/core/gesture`.
const helpers = [
  "./agent",
  "./gesture",
  "./history",
  "./observe",
  "./async-options",
  "./color",
  "./date",
  "./image",
  "./number",
  "./primitive",
  "./shortcuts",
  "./text-match",
]

describe("entries", () => {
  test("every React component entry has a web entry", () => {
    const components = Object.keys(react.exports).filter(
      (key) => !helpers.includes(key)
    )
    expect(components.map((key) => key.slice(2))).toEqual([...entries].sort())
  })

  test("each entry is exported, published and marked as a side effect", () => {
    for (const entry of entries) {
      expect(manifest.exports[`./${entry}`]).toBe(`./src/entries/${entry}.ts`)
      expect(manifest.publishConfig.exports[`./${entry}`]).toEqual({
        types: `./dist/entries/${entry}.d.ts`,
        default: `./dist/entries/${entry}.js`,
      })
    }
    expect(manifest.sideEffects).toEqual([
      "./src/entries/*.ts",
      "./dist/entries/*.js",
    ])
  })

  // A page that imports one entry types its tags, like `document.querySelector("ui-toggle")!.pressed`:
  // re-exporting the element type brings events.ts, which declares HTMLElementTagNameMap.
  test("each entry re-exports the element types of its tags", () => {
    const events = readFileSync(path.join(root, "src/events.ts"), "utf8")
    const tags = [
      ...events
        .match(/interface HTMLElementTagNameMap \{([^}]*)\}/)![1]
        .matchAll(/"(ui-[\w-]+)": (\w+)/g),
    ]
    expect(tags.length).toBeGreaterThan(40)
    const missing: string[] = []
    for (const [, tag, type] of tags) {
      // A tag with no element type of its own has nothing to re-export.
      if (type === "HTMLElement") {
        continue
      }
      // The entry named like the tag, like `toggle` for <ui-toggle-group> or `overlays` for <ui-overlay-host>.
      const entry = entries
        .filter((name) =>
          [name, name.replace(/s$/, "")].some(
            (stem) => tag === `ui-${stem}` || tag.startsWith(`ui-${stem}-`)
          )
        )
        .sort((a, b) => b.length - a.length)[0]
      const source = entry
        ? readFileSync(path.join(root, `src/entries/${entry}.ts`), "utf8")
        : ""
      const types = [
        ...source.matchAll(/export type \{([^}]*)\} from "\.\.\/events"/g),
      ].flatMap((match) => match[1].split(",").map((name) => name.trim()))
      // A part's type is generic, and any element type the entry re-exports brings the map.
      const brought =
        type === "UiPartElement" ? types.length > 0 : types.includes(type)
      if (!brought) {
        missing.push(`<${tag}> ${type}`)
      }
    }
    expect(missing).toEqual([])
  })

  // The first import of the root transforms every module, which takes longer while the whole suite runs.
  test(
    "the root exports no define functions",
    { timeout: 30_000 },
    async () => {
      const names = Object.keys(await import("../src/index"))
      expect(names.filter((name) => /^define\w+Elements$/.test(name))).toEqual(
        []
      )
    }
  )

  // Node has no `customElements`, like a server rendering the page.
  test.each(entries)(
    "importing %s on the server does nothing",
    async (entry) => {
      await expect(import(`../src/entries/${entry}.ts`)).resolves.toBeDefined()
      expect("customElements" in globalThis).toBe(false)
    }
  )
})

describe("claimTag", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  async function withRegistry(defined: string[]) {
    const tags = new Set(defined)
    vi.stubGlobal("customElements", {
      get: (tag: string) => (tags.has(tag) ? class {} : undefined),
    })
    const { claimTag } = await import("../src/define-element")
    return claimTag
  }

  test("claims a free tag once", async () => {
    const claimTag = await withRegistry([])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(claimTag("ui-accordion")).toBe(true)
    expect(claimTag("ui-accordion")).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  test("leaves a tag defined by someone else, with a warning", async () => {
    const claimTag = await withRegistry(["ui-accordion"])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(claimTag("ui-accordion")).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain("<ui-accordion> is already defined")
  })

  test("does nothing on the server", async () => {
    vi.resetModules()
    const { claimTag } = await import("../src/define-element")
    expect(claimTag("ui-accordion")).toBe(false)
  })
})
