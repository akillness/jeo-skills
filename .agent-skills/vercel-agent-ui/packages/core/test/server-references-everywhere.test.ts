// @vitest-environment jsdom
// The HTML a server sends names only ids its own elements have, since nothing
// repairs a reference before the page hydrates.
import { expect, test } from "vitest"
import { unwatched } from "../src/foundation/kernel/keep"
import { attrs, present } from "../src/foundation/kernel/part"
import { schemaOf } from "../src/foundation/kernel/primitive"
import type { Part, Primitive } from "../src/foundation/kernel/primitive-types"
import { parseMarkup, type MarkupNode } from "../src/testing/markup"
import { slotProps, tagOf } from "../src/testing/schema"
import { cases, type Case } from "./after-mount.cases"

const references = [
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
  "aria-activedescendant",
  "aria-owns",
  "aria-details",
  "aria-errormessage",
  "for",
]
// The parts an author leaves out on purpose, naming the element another way,
// and the attributes that point at them.
const optional = ["label", "title", "description"]
const naming = ["aria-labelledby", "aria-describedby"]

// A server render of markup, without what `checkServer` asserts about options.
function serverTree(entry: Case, nodes: (MarkupNode | string)[]) {
  const primitive = entry.primitive as Primitive
  const schema = schemaOf(primitive)
  const instance = unwatched(() =>
    primitive({ ...entry.options, id: "server" } as never)
  )
  const root = document.createElement("div")
  let count = 0
  const render = (
    node: MarkupNode | string,
    parent: Element,
    around: Record<string, Record<string, unknown>>
  ) => {
    if (typeof node === "string") {
      parent.append(node)
      return
    }
    const own = schema.slots[node.tag]
    if (!own) {
      const el = document.createElement(node.tag)
      node.attributes.forEach(([name, value]) => el.setAttribute(name, value))
      parent.append(el)
      node.children.forEach((child) => render(child, el, around))
      return
    }
    const { props, extra, as } = slotProps(
      own,
      node.attributes,
      around,
      () => `server-${node.tag}-${count++}`
    )
    const part = instance.part(node.tag as never, props as never) as Part
    if (!present(part)) {
      return
    }
    const written = attrs(part)
    const el = document.createElement(as ?? tagOf(written))
    for (const [name, value] of [...extra, ...Object.entries(written)]) {
      if (typeof value === "string") {
        el.setAttribute(name, value)
      }
    }
    parent.append(el)
    node.children.forEach((child) =>
      render(child, el, { ...around, [node.tag]: props })
    )
  }
  nodes.forEach((node) => render(node, root, {}))
  instance.destroy()
  return root
}

function dangling(root: Element, attributes: string[]) {
  const ids = new Set([...root.querySelectorAll("[id]")].map((el) => el.id))
  return [...root.querySelectorAll("[data-slot]")].flatMap((el) =>
    attributes.flatMap((attribute) =>
      (el.getAttribute(attribute) ?? "")
        .split(/\s+/)
        .filter((id) => id && !ids.has(id))
        .map((id) => `${el.getAttribute("data-slot")} ${attribute}=${id}`)
    )
  )
}

const without = (nodes: (MarkupNode | string)[], tag: string) =>
  nodes.flatMap((node): (MarkupNode | string)[] =>
    typeof node === "string"
      ? [node]
      : node.tag === tag
        ? []
        : [{ ...node, children: without(node.children, tag) }]
  )

// A reference the server writes to a part that was left out, which binding
// drops in the browser. Take a line out when its component stops writing it,
// and add none: a new part writes a reference only to what renders.
const known = new Set([
  "field without label: field-control aria-labelledby=server-label",
  "field without description: field-control aria-describedby=server-description",
  "meter without label: meter aria-labelledby=server-label",
  "progress without label: progress aria-labelledby=server-label",
  "tree without label: tree-item aria-labelledby=server-label-src",
  "tree without label: tree-item aria-labelledby=server-label-docs",
  "dialog without title: dialog-content aria-labelledby=server-title",
  "alert dialog without title: alert-dialog-content aria-labelledby=server-title",
  "drawer without title: drawer-content aria-labelledby=server-title",
  "select without label: select-trigger aria-labelledby=server-label",
])

test.each(cases)("$name: every reference names an element", (entry) => {
  const root = serverTree(entry, parseMarkup(entry.markup))
  expect(dangling(root, references)).toEqual([])
  const ids = [...root.querySelectorAll("[id]")].map((el) => el.id)
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
})

test("no part is named or described by a part that was left out", () => {
  const found = new Set<string>()
  for (const entry of cases) {
    const nodes = parseMarkup(entry.markup)
    for (const tag of optional.filter((tag) =>
      entry.markup.includes(`<${tag}`)
    )) {
      const root = serverTree(entry, without(nodes, tag))
      for (const reference of dangling(root, naming)) {
        found.add(`${entry.name} without ${tag}: ${reference}`)
      }
    }
  }
  expect([...found].filter((line) => !known.has(line))).toEqual([])
  expect([...known].filter((line) => !found.has(line))).toEqual([])
})
