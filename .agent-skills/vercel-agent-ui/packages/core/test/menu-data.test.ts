import { readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"

// Every framework renders data menus itself. Each one must pass every field of
// every item type, so a field added to `MenuDataItem` fails here until all
// renderers use it.
const packages = path.join(import.meta.dirname, "../..")
const renderers = {
  react: { file: "react/src/menu.tsx", start: "function MenuItems" },
  vue: { file: "vue/src/menu.ts", start: "const MenuItems" },
  web: { file: "web/src/menu.ts", start: "function renderMenuItems" },
}

// Fields a renderer has no use for, with the reason.
const keywords = {
  "item.keywords":
    "Menus don't filter. Keywords come with data shared with Command.",
}
const unused: Record<string, Record<string, string>> = {
  react: keywords,
  vue: keywords,
  web: {
    ...keywords,
    "radio-group.name":
      "Web components key a group by its element, so the name has nothing to key.",
  },
}

// The fields of each item type, read from the core's types.
function dataFields() {
  const source = path.join(packages, "core/src/components/menu/menu.ts")
  const program = ts.createProgram([source], { strict: true, noEmit: true })
  const checker = program.getTypeChecker()
  const file = program.getSourceFile(source)!
  const symbol = checker
    .getExportsOfModule(checker.getSymbolAtLocation(file)!)
    .find((s) => s.name === "MenuDataItem")!
  const union = checker.getDeclaredTypeOfSymbol(symbol)
  const fields: Record<string, { item: string[]; radio: string[] }> = {}
  for (const member of union.isUnion() ? union.types : [union]) {
    const names = checker
      .getPropertiesOfType(member)
      .map((property) => property.name)
    const typeProperty = checker.getPropertyOfType(member, "type")!
    const typeOf = checker.getTypeOfSymbol(typeProperty)
    const literal = (typeOf.isUnion() ? typeOf.types : [typeOf]).find((type) =>
      type.isStringLiteral()
    )
    const type = (literal as ts.StringLiteralType).value
    let radio: string[] = []
    if (type === "radio-group") {
      const items = checker.getTypeOfSymbol(
        checker.getPropertyOfType(member, "items")!
      )
      const element = checker.getIndexTypeOfType(items, ts.IndexKind.Number)!
      radio = checker
        .getPropertiesOfType(element)
        .map((property) => property.name)
    }
    fields[type] = { item: names.filter((name) => name !== "type"), radio }
  }
  return fields
}

// The code that renders one item type: from its case label to the next one.
function caseBlocks(code: string, types: string[]) {
  const starts = types
    .map((type) => ({ type, index: code.indexOf(`case "${type}":`) }))
    .sort((a, b) => a.index - b.index)
  return Object.fromEntries(
    starts.map(({ type, index }, i) => [
      type,
      code.slice(index, starts[i + 1]?.index ?? code.length),
    ])
  )
}

describe("data menu renderers", () => {
  const fields = dataFields()

  test("the core's item types are all known", () => {
    expect(Object.keys(fields).sort()).toEqual([
      "checkbox",
      "group",
      "item",
      "radio-group",
      "separator",
      "submenu",
    ])
  })

  for (const [name, { file, start }] of Object.entries(renderers)) {
    test(`${name} passes every field of every item type`, () => {
      const source = readFileSync(path.join(packages, file), "utf8")
      const code = source.slice(source.indexOf(start))
      const blocks = caseBlocks(code, Object.keys(fields))
      const missing: string[] = []
      for (const [type, { item, radio }] of Object.entries(fields)) {
        expect(blocks[type], `${name} renders ${type}`).toBeDefined()
        for (const field of item) {
          if (!blocks[type].includes(`item.${field}`)) {
            missing.push(`${type}.${field}`)
          }
        }
        for (const field of radio) {
          if (!blocks[type].includes(`radio.${field}`)) {
            missing.push(`${type}.items[].${field}`)
          }
        }
      }
      expect(missing.filter((field) => !unused[name]?.[field])).toEqual([])
    })
  }
})
