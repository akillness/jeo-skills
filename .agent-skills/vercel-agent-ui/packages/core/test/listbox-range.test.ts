import { describe, expect, test } from "vitest"
import {
  allToggled,
  keysBetween,
  rangeSelection,
  isSameKeys,
  toggledKeys,
} from "../src/foundation/selection/listbox-range"

const order = ["a", "b", "c", "d", "e", "f"]
const everything = () => true

describe("listbox ranges", () => {
  test("keys between two keys include both, in either direction", () => {
    expect(keysBetween(order, "b", "d")).toEqual(["b", "c", "d"])
    expect(keysBetween(order, "d", "b")).toEqual(["b", "c", "d"])
    expect(keysBetween(order, "c", "c")).toEqual(["c"])
  })

  test("keys that aren't in the list make no range", () => {
    expect(keysBetween(order, "x", "b")).toEqual([])
    expect(keysBetween(order, "b", "x")).toEqual([])
  })

  test("a range that replaces the selection is only the range", () => {
    const anchor = { key: "b", base: ["a", "f"] }
    expect(
      rangeSelection(order, anchor, "d", {
        additive: false,
        selectable: everything,
      })
    ).toEqual(["b", "c", "d"])
  })

  test("a range that adds keeps the base first, in its order", () => {
    const anchor = { key: "c", base: ["f", "a"] }
    expect(
      rangeSelection(order, anchor, "e", {
        additive: true,
        selectable: everything,
      })
    ).toEqual(["f", "a", "c", "d", "e"])
  })

  test("extending again replaces the range, not the base, so a range can shrink", () => {
    const anchor = { key: "b", base: ["f"] }
    const wide = rangeSelection(order, anchor, "e", {
      additive: true,
      selectable: everything,
    })
    const narrow = rangeSelection(order, anchor, "c", {
      additive: true,
      selectable: everything,
    })
    expect(wide).toEqual(["f", "b", "c", "d", "e"])
    expect(narrow).toEqual(["f", "b", "c"])
  })

  test("a range skips keys that can't be chosen", () => {
    const anchor = { key: "a", base: [] }
    const selectable = (key: string) => key !== "c"
    expect(
      rangeSelection(order, anchor, "d", { additive: false, selectable })
    ).toEqual(["a", "b", "d"])
  })

  test("a range from an anchor that can't be chosen starts after it", () => {
    const anchor = { key: "a", base: [] }
    expect(
      rangeSelection(order, anchor, "c", {
        additive: false,
        selectable: (key) => key !== "a",
      })
    ).toEqual(["b", "c"])
  })

  test("toggling adds a key at the end, or removes it", () => {
    expect(toggledKeys(["a", "c"], "b")).toEqual(["a", "c", "b"])
    expect(toggledKeys(["a", "c"], "a")).toEqual(["c"])
  })

  test("toggling all selects every selectable key, then none of them", () => {
    const selectable = ["a", "b", "d"]
    const all = allToggled(["d"], selectable)
    expect(all).toEqual(["d", "a", "b"])
    expect(allToggled(all, selectable)).toEqual([])
  })

  test("toggling all leaves keys that can't be chosen as they were", () => {
    expect(allToggled(["c", "a", "b", "d"], ["a", "b", "d"])).toEqual(["c"])
    expect(allToggled(["c"], ["a"])).toEqual(["c", "a"])
  })

  test("toggling all with nothing selectable changes nothing", () => {
    expect(allToggled(["c"], [])).toEqual(["c"])
  })

  test("key lists are the same only in the same order", () => {
    expect(isSameKeys(["a", "b"], ["a", "b"])).toBe(true)
    expect(isSameKeys(["a", "b"], ["b", "a"])).toBe(false)
    expect(isSameKeys(["a"], ["a", "b"])).toBe(false)
  })
})
