import { describe, expect, test } from "vitest"
import {
  toggleTreeChecked,
  treeCheckedStates,
} from "../src/foundation/lists/tree-checked"
import {
  createTreeCollection,
  treeDataNodes,
} from "../src/foundation/lists/tree-collection"

// fruit: apple, berries (straw, blue), lemon. veg: carrot. nuts loads later.
const tree = createTreeCollection(
  treeDataNodes([
    {
      value: "fruit",
      label: "Fruit",
      children: [
        { value: "apple", label: "Apple" },
        {
          value: "berries",
          label: "Berries",
          children: [
            { value: "straw", label: "Strawberry" },
            { value: "blue", label: "Blueberry" },
          ],
        },
        { value: "lemon", label: "Lemon" },
      ],
    },
    {
      value: "veg",
      label: "Veg",
      children: [{ value: "carrot", label: "Carrot" }],
    },
    { value: "nuts", label: "Nuts", children: [] },
  ])
)

describe("treeCheckedStates", () => {
  test("a branch is checked when all its leaves are, and mixed when some are", () => {
    const state = treeCheckedStates(tree, ["straw", "blue", "apple"])
    expect(state("berries")).toBe(true)
    expect(state("fruit")).toBe("indeterminate")
    expect(state("lemon")).toBe(false)
    expect(state("veg")).toBe(false)
  })

  test("a branch in the value stands for everything in it", () => {
    const state = treeCheckedStates(tree, ["fruit"])
    for (const key of ["fruit", "apple", "berries", "straw", "blue", "lemon"]) {
      expect(state(key)).toBe(true)
    }
  })

  test("independent checks never cascade", () => {
    const state = treeCheckedStates(tree, ["fruit"], "independent")
    expect(state("fruit")).toBe(true)
    expect(state("apple")).toBe(false)
  })

  test("a branch whose children haven't loaded checks like a leaf", () => {
    expect(treeCheckedStates(tree, ["nuts"])("nuts")).toBe(true)
  })
})

describe("toggleTreeChecked", () => {
  test("checking a branch checks everything in it, reported per strategy", () => {
    expect(toggleTreeChecked(tree, [], "berries")).toEqual(["straw", "blue"])
    expect(
      toggleTreeChecked(tree, [], "berries", { strategy: "branch" })
    ).toEqual(["berries", "straw", "blue"])
    expect(
      toggleTreeChecked(tree, [], "berries", { strategy: "trunk" })
    ).toEqual(["berries"])
    // Checking the last leaf makes the whole branch the trunk.
    expect(
      toggleTreeChecked(tree, ["apple", "berries"], "lemon", {
        strategy: "trunk",
      })
    ).toEqual(["fruit"])
  })

  test("pressing a mixed branch checks everything in it, and a checked one unchecks it", () => {
    expect(toggleTreeChecked(tree, ["apple", "carrot"], "fruit")).toEqual([
      "apple",
      "straw",
      "blue",
      "lemon",
      "carrot",
    ])
    expect(toggleTreeChecked(tree, ["fruit"], "fruit")).toEqual([])
  })

  test("refused items keep their state and shield what's under them", () => {
    const checkable = (key: string) => key !== "berries" && key !== "lemon"
    expect(toggleTreeChecked(tree, ["lemon"], "fruit", { checkable })).toEqual([
      "apple",
      "lemon",
    ])
    expect(toggleTreeChecked(tree, [], "berries", { checkable })).toEqual([])
  })

  test("a branch held mixed by a refused leaf still unchecks what it can", () => {
    const checkable = (key: string) => key !== "lemon"
    const all = toggleTreeChecked(tree, [], "fruit", { checkable })
    expect(all).toEqual(["apple", "straw", "blue"])
    expect(treeCheckedStates(tree, all)("fruit")).toBe("indeterminate")
    expect(toggleTreeChecked(tree, all, "fruit", { checkable })).toEqual([])
  })

  test("independent checks toggle one item", () => {
    expect(
      toggleTreeChecked(tree, ["fruit"], "apple", { strategy: "independent" })
    ).toEqual(["fruit", "apple"])
    expect(
      toggleTreeChecked(tree, ["fruit", "apple"], "fruit", {
        strategy: "independent",
      })
    ).toEqual(["apple"])
  })
})
