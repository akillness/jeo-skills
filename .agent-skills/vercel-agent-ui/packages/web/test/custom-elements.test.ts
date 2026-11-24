// @vitest-environment node
// The elements manifest and the VS Code data a release ships, generated here
// so a define call the generator can't read fails now, not at release.
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { entryOf } from "../src/autoload"

const root = path.resolve(import.meta.dirname, "..")
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
const entries = readdirSync(path.join(root, "src/entries")).map((file) =>
  file.replace(/\.ts$/, "")
)
const out = mkdtempSync(path.join(tmpdir(), "ui-sdk-elements-"))

type Field = {
  kind?: "field" | "method"
  name: string
  type?: { text: string }
  description?: string
  default?: string
  fieldName?: string
  readonly?: boolean
}
type Declaration = {
  tagName: string
  name: string
  description: string
  attributes: Field[]
  members: Field[]
  events: Field[]
}
type Manifest = {
  modules: {
    path: string
    declarations: Declaration[]
    exports: { name: string; declaration: { name: string; module: string } }[]
  }[]
}

let manifest: Manifest
let customData: { tags: { name: string; attributes: { name: string }[] }[] }
let missing: string[]

beforeAll(() => {
  const run = spawnSync(
    "node",
    [path.join(root, "../../scripts/package-docs.mjs"), "--elements", out],
    {
      encoding: "utf8",
    }
  )
  expect(run.status, run.stderr).toBe(0)
  manifest = JSON.parse(
    readFileSync(path.join(out, "custom-elements.json"), "utf8")
  )
  customData = JSON.parse(
    readFileSync(path.join(out, "html-custom-data.json"), "utf8")
  )
  missing = [...run.stderr.matchAll(/^ {2}(<.+)$/gm)].map((match) => match[1])
}, 120_000)

afterAll(() => rmSync(out, { recursive: true, force: true }))

const declarations = () =>
  manifest.modules.flatMap((module) => module.declarations)

describe("custom elements manifest", () => {
  test("package.json points to it and ships both files", () => {
    expect(pkg.customElements).toBe("custom-elements.json")
    expect(pkg.files).toEqual(
      expect.arrayContaining(["custom-elements.json", "html-custom-data.json"])
    )
  })

  test("declares every tag the web package defines, once", () => {
    const tags = declarations().map((declaration) => declaration.tagName)
    expect(new Set(tags).size).toBe(tags.length)
    const written = readdirSync(path.join(root, "src"))
      // define-element.ts names tags only in its examples.
      .filter((file) => file.endsWith(".ts") && file !== "define-element.ts")
      .flatMap((file) => {
        const source = readFileSync(path.join(root, "src", file), "utf8")
        return [
          ...source.matchAll(/claimTag\("(ui-[\w-]+)"/g),
          // Tags `createParts` and `definePart` take, by slot or as `tag`.
          ...source.matchAll(
            /(?:(?:^\s*"?[\w-]+"?|\btag):|definePart\(\w+, "[\w-]+",)\s*"(ui-[\w-]+)"/gm
          ),
        ]
      })
      .map((match) => match[1])
    expect(written.length).toBeGreaterThan(100)
    expect(tags).toEqual(expect.arrayContaining(written))
  })

  test("has a module per entry, and each entry exports the tags its import defines", () => {
    expect(manifest.modules.map((module) => module.path).sort()).toEqual(
      entries
        .map((entry) =>
          pkg.publishConfig.exports[`./${entry}`].default.replace(/^\.\//, "")
        )
        .sort()
    )
    const declared = new Map(
      manifest.modules.flatMap((module) =>
        module.declarations.map(
          (declaration) => [declaration.name, module.path] as const
        )
      )
    )
    for (const module of manifest.modules) {
      expect(module.exports.length).toBeGreaterThan(0)
      for (const { declaration } of module.exports) {
        expect(declared.get(declaration.name)).toBe(declaration.module)
      }
    }
    const tabs = manifest.modules.find(
      (module) => module.path === "dist/entries/tabs.js"
    )!
    expect(tabs.exports.map((definition) => definition.name)).toEqual(
      expect.arrayContaining([
        "ui-tabs",
        "ui-tabs-list",
        "ui-tabs-tab",
        "ui-tabs-panel",
      ])
    )
  })

  // The browser build's `web.js` loads the entry named like a tag the first time it appears.
  test("the loader finds an entry that defines every tag", () => {
    const definedBy = new Map<string, Set<string>>()
    for (const module of manifest.modules) {
      const entry = path.basename(module.path, ".js")
      for (const { name } of module.exports) {
        definedBy.set(name, (definedBy.get(name) ?? new Set()).add(entry))
      }
    }
    expect(definedBy.size).toBeGreaterThan(100)
    const unfound = [...definedBy].filter(
      ([tag, defining]) => !defining.has(entryOf(tag, entries) ?? "")
    )
    expect(unfound).toEqual([])
  })

  test("describes every element, types every attribute, and names events as the DOM fires them", () => {
    for (const declaration of declarations()) {
      expect(declaration.description, declaration.tagName).toMatch(
        /Defined by `import "@ui-sdk\/web\/[\w-]+"`/
      )
      for (const attribute of declaration.attributes) {
        expect(attribute.name, declaration.tagName).toMatch(/^[a-z][a-z-]*$/)
        expect(
          attribute.type?.text,
          `${declaration.tagName} ${attribute.name}`
        ).toBeTruthy()
      }
      for (const event of declaration.events) {
        expect(event.name, declaration.tagName).toMatch(/^[a-z]+$/)
      }
    }
  })

  test("reads the core's types and docs", () => {
    const tabs = declarations().find(
      (declaration) => declaration.tagName === "ui-tabs"
    )!
    expect(tabs.description).toContain("── ui-tabs-list")
    expect(
      tabs.attributes.find((attribute) => attribute.name === "orientation")
    ).toMatchObject({
      type: { text: '"horizontal" | "vertical"' },
      description: expect.stringContaining("arrow keys"),
    })
    expect(
      tabs.members.find((member) => member.name === "value")?.type?.text
    ).toBe("string | null")
    expect(
      tabs.events.find((event) => event.name === "valuechange")
    ).toMatchObject({
      type: { text: "UiChangeEvent<string | null, TabsValueChangeReason>" },
      description: expect.stringContaining("`event.preventDefault()`"),
    })
  })

  test("names a renamed event as the define call does", () => {
    const menu = declarations().find(
      (declaration) => declaration.tagName === "ui-trigger-menu"
    )!
    const names = menu.events.map((event) => event.name)
    expect(names).toContain("itemselect")
    expect(names).not.toContain("select")
  })

  test("VS Code's data has the same tags and attributes", () => {
    const byTag = (a: [string, string[]], b: [string, string[]]) =>
      a[0].localeCompare(b[0])
    expect(
      customData.tags
        .map((tag): [string, string[]] => [
          tag.name,
          tag.attributes.map((attribute) => attribute.name),
        ])
        .sort(byTag)
    ).toEqual(
      declarations()
        .map((declaration): [string, string[]] => [
          declaration.tagName,
          declaration.attributes.map((attribute) => attribute.name),
        ])
        .sort(byTag)
    )
  })

  test("has a property for every attribute, and booleans that start on read true", () => {
    const wrong: string[] = []
    for (const declaration of declarations()) {
      for (const attribute of declaration.attributes) {
        if (attribute.name === "for" || attribute.name === "as-child") {
          continue
        }
        const member = declaration.members.find(
          (member) => member.name === attribute.fieldName
        )
        if (!member) {
          // A readonly property, like `form`, has the attribute's name but doesn't reflect it.
          if (
            !declaration.members.some(
              (member) => member.readonly && member.name === attribute.name
            )
          ) {
            wrong.push(
              `<${declaration.tagName}> ${attribute.name} has no property`
            )
          }
          continue
        }
        // The define call's `defaults` agree with the core's `@defaultValue`,
        // like "true, or false when `modal` is false" for a dialog's
        // `closeOnOutsidePress`.
        const on = /^true\b|else true$/.test(attribute.default ?? "")
        if (
          member.default === (on ? "false" : "true") ||
          (on && member.default !== "true")
        ) {
          wrong.push(
            `<${declaration.tagName}> ${member.name} starts ${attribute.default ?? "false"}`
          )
        }
      }
    }
    expect(wrong).toEqual([])
  })

  // `formAssociated` in define-element.ts gives them what a native input has.
  test("gives form-associated elements an input's form members", () => {
    for (const tag of [
      "ui-checkbox",
      "ui-date-picker",
      "ui-file-input",
      "ui-number-input",
      "ui-slider",
    ]) {
      const { attributes, members } = declarations().find(
        (declaration) => declaration.tagName === tag
      )!
      const form = members.find((member) => member.name === "form")
      const methods = members
        .filter((member) => member.kind === "method")
        .map((member) => member.name)
      expect(form, tag).toMatchObject({
        type: { text: "HTMLFormElement | null" },
        readonly: true,
      })
      // The attribute names a form by id, so setting the property in its place would throw.
      const attribute = attributes.find(
        (attribute) => attribute.name === "form"
      )
      expect(attribute, tag).toBeDefined()
      expect(attribute, tag).not.toHaveProperty("fieldName")
      expect(methods, tag).toEqual(
        expect.arrayContaining([
          "checkValidity",
          "reportValidity",
          "setCustomValidity",
        ])
      )
    }
  })

  // A new one is described in the core's JSDoc, on its element type in
  // events.ts, or above its define call.
  test("describes every attribute, property, event and method", () => {
    expect(missing).toEqual([])
  })
})
