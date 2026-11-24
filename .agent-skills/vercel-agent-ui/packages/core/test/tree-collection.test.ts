import { describe, expect, test } from "vitest"
import {
  createTreeCollection,
  treeDataNodes,
  treeFromPaths,
  visibleTreeRows,
  type TreeItemData,
} from "../src/foundation/lists/tree-collection"

const nodes = [
  { key: "src", parent: null },
  { key: "src/a.ts", parent: "src" },
  { key: "src/lib", parent: "src" },
  { key: "src/lib/b.ts", parent: "src/lib" },
  { key: "README.md", parent: null },
  { key: "docs", parent: null, branch: true },
]

describe("createTreeCollection", () => {
  test("knows parents, children, levels and positions", () => {
    const tree = createTreeCollection(nodes)
    expect(tree.size).toBe(6)
    expect(tree.children(null)).toEqual(["src", "README.md", "docs"])
    expect(tree.children("src")).toEqual(["src/a.ts", "src/lib"])
    expect(tree.parent("src/lib/b.ts")).toBe("src/lib")
    expect(tree.level("src/lib/b.ts")).toBe(3)
    expect(tree.position("src/lib")).toEqual({ index: 2, size: 2 })
    expect(tree.position("docs")).toEqual({ index: 3, size: 3 })
    expect(tree.ancestors("src/lib/b.ts")).toEqual(["src", "src/lib"])
    expect(tree.descendants("src")).toEqual([
      "src/a.ts",
      "src/lib",
      "src/lib/b.ts",
    ])
    expect(tree.keys()).toEqual([
      "src",
      "src/a.ts",
      "src/lib",
      "src/lib/b.ts",
      "README.md",
      "docs",
    ])
  })

  test("a node listed as a branch is one before its children are known", () => {
    const tree = createTreeCollection(nodes)
    expect(tree.isBranch("docs")).toBe(true)
    expect(tree.isBranch("src")).toBe(true)
    expect(tree.isBranch("README.md")).toBe(false)
  })

  test("children listed before their parent still nest, and an unknown parent puts a node at the top", () => {
    const tree = createTreeCollection([
      { key: "b", parent: "a" },
      { key: "a", parent: null },
      { key: "orphan", parent: "missing" },
    ])
    expect(tree.children(null)).toEqual(["a", "orphan"])
    expect(tree.children("a")).toEqual(["b"])
    expect(tree.parent("orphan")).toBeNull()
  })

  test("only expanded branches show their children, and the answer is kept for the same list", () => {
    const tree = createTreeCollection(nodes)
    const expanded = ["src"]
    expect(tree.visible(expanded)).toEqual([
      "src",
      "src/a.ts",
      "src/lib",
      "README.md",
      "docs",
    ])
    expect(tree.visible(expanded)).toBe(tree.visible(expanded))
    // A branch under a collapsed one stays hidden, even when it's expanded.
    expect(tree.visible(["src/lib"])).toEqual(["src", "README.md", "docs"])
    expect(tree.visible(["src", "src/lib"])).toContain("src/lib/b.ts")
  })

  test("a branch pushed into the same expanded list shows its children", () => {
    const tree = createTreeCollection(nodes)
    const expanded = ["src"]
    expect(tree.visible(expanded)).not.toContain("src/lib/b.ts")
    expanded.push("src/lib")
    expect(tree.visible(expanded)).toContain("src/lib/b.ts")
  })

  test("unknown keys answer without throwing", () => {
    const tree = createTreeCollection(nodes)
    expect(tree.has("nope")).toBe(false)
    expect(tree.children("nope")).toEqual([])
    expect(tree.position("nope")).toEqual({ index: 0, size: 0 })
    expect(tree.level("nope")).toBe(1)
  })
})

describe("tree data", () => {
  const items: TreeItemData[] = [
    { value: "a", label: "A", children: [{ value: "a1", label: "A1" }] },
    { value: "b", label: "B", children: [] },
    { value: "c", label: "C" },
  ]

  test("lists data as nodes, with an empty children list as a branch", () => {
    const tree = createTreeCollection(treeDataNodes(items))
    expect(tree.keys()).toEqual(["a", "a1", "b", "c"])
    expect(tree.isBranch("b")).toBe(true)
    expect(tree.isBranch("c")).toBe(false)
  })

  test("lists the rows that show with their levels, for a flat rendering", () => {
    const rows = visibleTreeRows(items, ["a"])
    expect(
      rows.map((row) => [row.item.value, row.parent, row.level, row.index])
    ).toEqual([
      ["a", null, 1, 0],
      ["a1", "a", 2, 1],
      ["b", null, 1, 2],
      ["c", null, 1, 3],
    ])
  })
})

describe("treeFromPaths", () => {
  test("builds folders first, with full paths as values", () => {
    const items = treeFromPaths([
      "README.md",
      "src/index.ts",
      "src/lib/util.ts",
      "docs/",
      "src/app.ts",
    ])
    expect(items.map((item) => item.value)).toEqual([
      "src",
      "docs",
      "README.md",
    ])
    const src = items[0]
    expect(src.label).toBe("src")
    expect(src.children!.map((item) => item.value)).toEqual([
      "src/lib",
      "src/index.ts",
      "src/app.ts",
    ])
    expect(src.children![0].children).toEqual([
      { value: "src/lib/util.ts", label: "util.ts" },
    ])
    expect(items[1]).toEqual({ value: "docs", label: "docs", children: [] })
  })

  test("a path listed twice is one item", () => {
    expect(treeFromPaths(["a.ts", "a.ts"])).toEqual([
      { value: "a.ts", label: "a.ts" },
    ])
  })
})
