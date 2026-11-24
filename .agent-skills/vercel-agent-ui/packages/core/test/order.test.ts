import { describe, expect, test } from "vitest"
import { elements } from "../src/foundation/kernel/elements"
import { createOrder } from "../src/foundation/kernel/order"
import type { Part } from "../src/foundation/kernel/primitive-types"

// Just enough of a DOM for `createOrder` in Node: parents, children, a tree
// walker, and comparisons, which `compared` counts.
type FakeNode = {
  name: string
  parentNode: FakeNode | null
  children: FakeNode[]
  isConnected: boolean
  ownerDocument: typeof fakeDocument
  contains: (other: FakeNode) => boolean
  compareDocumentPosition: (other: FakeNode) => number
}

let compared = 0
let walked = 0

// A node and its descendants, children first, the order a TreeWalker visits.
const inOrder = (node: FakeNode): FakeNode[] => [
  node,
  ...node.children.flatMap(inOrder),
]

const fakeDocument = {
  createTreeWalker(root: FakeNode) {
    const nodes = inOrder(root)
    let index = 0
    return {
      get currentNode() {
        return nodes[index]
      },
      nextNode: () => (walked++, nodes[++index] ?? null),
    }
  },
}

function node(name: string, children: FakeNode[] = []): FakeNode {
  const self: FakeNode = {
    name,
    parentNode: null,
    children,
    isConnected: true,
    ownerDocument: fakeDocument,
    contains(other) {
      for (let at: FakeNode | null = other; at; at = at.parentNode) {
        if (at === self) {
          return true
        }
      }
      return false
    },
    compareDocumentPosition: () => 0,
  }
  for (const child of children) {
    child.parentNode = self
  }
  return self
}

// Compares nodes by their place in `roots`, one tree after another.
function compareWithin(...roots: FakeNode[]) {
  const all = roots.flatMap(inOrder)
  for (const each of all) {
    each.compareDocumentPosition = (other) => {
      compared++
      // Node.DOCUMENT_POSITION_FOLLOWING or PRECEDING.
      return all.indexOf(other) > all.indexOf(each) ? 4 : 2
    }
  }
}

const itemsIn = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) =>
    node(`${prefix}${index}`, [node(`${prefix}${index}-label`)])
  )

// Adds the items back to front, like parts a framework binds out of order,
// and reads the order.
function listOf(items: FakeNode[]) {
  const order = createOrder<{ key: string; el: HTMLElement }>()
  for (const item of [...items].reverse()) {
    order.add({ key: item.name, el: item as unknown as HTMLElement })
  }
  compared = 0
  walked = 0
  return order.list().map((entry) => entry.key)
}

describe("document order", () => {
  test("a long list registered out of order comes back in document order without comparing", () => {
    const first = itemsIn(20, "a")
    const second = itemsIn(20, "b")
    const page = node("page", [
      node("list", [
        node("group", first),
        node("separator"),
        node("group", second),
      ]),
    ])
    compareWithin(page)
    const items = [...first, ...second]
    expect(listOf(items)).toEqual(items.map((item) => item.name))
    expect(compared).toBe(0)
  })

  test("a list in separate trees, like a shadow root and the page, is compared", () => {
    const shown = itemsIn(10, "a")
    const elsewhere = itemsIn(10, "b")
    const page = node("page", [node("list", shown)])
    const shadow = node("shadow", elsewhere)
    compareWithin(page, shadow)
    const items = [...shown, ...elsewhere]
    expect(listOf(items)).toEqual(items.map((item) => item.name))
    expect(compared).toBeGreaterThan(0)
  })

  test("an item that holds the others comes first, without comparing", () => {
    const inner = itemsIn(20, "a")
    const outer = node("outer", inner)
    compareWithin(node("page", [outer]))
    const items = [outer, ...inner]
    expect(listOf(items)).toEqual(items.map((item) => item.name))
    expect(compared).toBe(0)
  })

  test("a list spread across a large page is compared instead of walking the page", () => {
    // Twenty items, each at the end of a section of a hundred elements.
    const items = itemsIn(20, "a")
    const sections = items.map((item, index) =>
      node(`section${index}`, [...itemsIn(100, `s${index}-`), item])
    )
    compareWithin(node("page", sections))
    expect(listOf(items)).toEqual(items.map((item) => item.name))
    expect(compared).toBeGreaterThan(0)
    // The walk gave up after 32 elements per entry, not the page's 4,000.
    expect(walked).toBeLessThanOrEqual(20 * 32)
  })
})

describe("items joining a kept order", () => {
  // A long list read once, then a folder's two items joining in the middle.
  function joined() {
    const before = itemsIn(500, "a")
    const added = itemsIn(2, "new")
    const after = itemsIn(500, "b")
    const page = node("page", [node("list", [...before, ...added, ...after])])
    compareWithin(page)
    const order = createOrder<{ key: string; el: HTMLElement }>()
    const add = (item: FakeNode) =>
      order.add({ key: item.name, el: item as unknown as HTMLElement })
    const leaves = new Map(
      [...before, ...after].map((item) => [item.name, add(item)])
    )
    order.list()
    compared = 0
    walked = 0
    return { order, add, leaves, items: [...before, ...added, ...after], added }
  }

  test("take their places by binary search, without sorting or walking the list again", () => {
    const { order, add, items, added } = joined()
    added.forEach(add)
    expect(order.list().map((entry) => entry.key)).toEqual(
      items.map((item) => item.name)
    )
    expect(walked).toBe(0)
    expect(compared).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(1002)))
  })

  test("items that leave drop out without comparing", () => {
    const { order, leaves } = joined()
    leaves.get("a3")!()
    leaves.get("b7")!()
    const keys = order.list().map((entry) => entry.key)
    expect(keys).toHaveLength(998)
    expect(keys).not.toContain("a3")
    expect(keys).not.toContain("b7")
    expect(compared + walked).toBe(0)
  })

  test("an item added again under its key replaces the old one in its place", () => {
    const { order, add, items } = joined()
    const replacement = items[10]
    add(replacement)
    const keys = order.list().map((entry) => entry.key)
    expect(keys.filter((key) => key === replacement.name)).toHaveLength(1)
    expect(keys[10]).toBe(replacement.name)
  })

  test("many items joining at once sort the whole list instead", () => {
    const kept = itemsIn(20, "a")
    const late = itemsIn(400, "late")
    compareWithin(node("page", [node("list", [...kept, ...late])]))
    const order = createOrder<{ key: string; el: HTMLElement }>()
    const add = (item: FakeNode) =>
      order.add({ key: item.name, el: item as unknown as HTMLElement })
    kept.forEach(add)
    order.list()
    late.forEach(add)
    compared = 0
    walked = 0
    expect(order.list().map((entry) => entry.key)).toEqual(
      [...kept, ...late].map((item) => item.name)
    )
    // One walk of the list, not 400 binary searches.
    expect(compared).toBe(0)
    expect(walked).toBeGreaterThan(0)
  })
})

describe("a slot's elements", () => {
  test("come back in document order after the items move, from one walk instead of comparing", () => {
    const items = itemsIn(20, "a")
    const list = node("list", items)
    const page = node("page", [list])
    compareWithin(page)
    const parts = items.map((item) => ({
      slot: "item",
      key: item.name,
      props: {},
      el: item,
    }))
    const context = { parts: () => parts as unknown as Part[] }
    const keys = () => elements(context, "item").map(({ key }) => key)
    expect(keys()).toEqual(items.map((item) => item.name))

    list.children.reverse()
    compareWithin(page)
    compared = 0
    expect(keys()).toEqual(list.children.map((item) => item.name))
    expect(compared).toBe(0)
  })
})
