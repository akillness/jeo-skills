import { describe, expect, test } from "vitest"
import { rating, ratingItemValues } from "../src/components/rating/rating"
import { attrs, partState } from "../src/foundation/kernel/part"

describe("rating", () => {
  test("each star holds a radio per step", () => {
    expect(ratingItemValues(3)).toEqual([3])
    expect(ratingItemValues(3, 0.5)).toEqual([2.5, 3])
  })

  test("stars fill up to the score, with a partial star for a fraction", () => {
    const instance = rating({ id: "r", defaultValue: 2.5 })
    const fill = (index: number) =>
      (partState(instance.part("item", { index })) as { fill: number }).fill
    expect([1, 2, 3, 4].map(fill)).toEqual([1, 1, 0.5, 0])
    expect(attrs(instance.part("item", { index: 3 }))).toMatchObject({
      "data-partial": "",
      "data-checked": "",
    })
  })

  test("radios are named by their score and split their star", () => {
    const instance = rating({ id: "r", step: 0.5 })
    expect(attrs(instance.part("radio", { value: "1" }))).toMatchObject({
      role: "radio",
      "aria-label": "1 star",
    })
    const half = attrs(instance.part("radio", { value: "2.5" }))
    expect(half["aria-label"]).toBe("2.5 stars")
    expect(half.style).toContain("inset-inline-start:0%;width:50%")
  })

  test("the controller reads and writes numbers", () => {
    const instance = rating({ id: "r", defaultValue: 3 })
    expect(instance.api.getValue()).toBe(3)
    expect(instance.api.setValue(4)).toBe(true)
    expect(instance.api.getValue()).toBe(4)
  })

  test("pressing the checked star clears a deselectable rating", () => {
    const instance = rating({ id: "r", defaultValue: 3, deselectable: true })
    instance.api.internal.check("3")
    expect(instance.api.getValue()).toBeNull()
    const kept = rating({ id: "k", defaultValue: 3 })
    kept.api.internal.check("3")
    expect(kept.api.getValue()).toBe(3)
  })

  test("a read-only rating is an image named by its score", () => {
    const instance = rating({ id: "r", value: 4.2, readOnly: true })
    expect(attrs(instance.part("root", {}))).toMatchObject({
      role: "img",
      "aria-label": "4.2 stars",
    })
  })
})
