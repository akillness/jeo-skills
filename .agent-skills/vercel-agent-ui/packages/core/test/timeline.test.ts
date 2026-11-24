import { describe, expect, test } from "vitest"
import { timeline } from "../src/components/timeline/timeline"
import {
  attrs as partAttrs,
  bind,
  liveAttrs,
  partState,
} from "../src/foundation/kernel/part"
import { fakeElement } from "./selects"

describe("timeline", () => {
  test("the root is a vertical list by default", () => {
    expect(partAttrs(timeline({ id: "c" }).part("root"))).toMatchObject({
      role: "list",
      "aria-busy": undefined,
      "data-orientation": "vertical",
    })
  })

  test("an unknown orientation is vertical", () => {
    const root = timeline({
      id: "c",
      orientation: "Horizontal" as "horizontal",
    }).part("root")
    expect(partAttrs(root)["data-orientation"]).toBe("vertical")
  })

  test("a feed is busy only while busy is set", () => {
    const instance = timeline({ id: "c", feed: true })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      role: "feed",
      "aria-busy": undefined,
    })
    instance.setOptions({ id: "c", feed: true, busy: true })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      "aria-busy": "true",
      "data-busy": "",
    })
  })

  test("a list ignores busy", () => {
    const root = timeline({ id: "c", busy: true }).part("root")
    expect(partAttrs(root)["aria-busy"]).toBeUndefined()
  })

  test("items are list items in a list and articles in a feed", () => {
    expect(
      partAttrs(timeline({ id: "c" }).part("item", { value: "a" })).role
    ).toBe("listitem")
    expect(
      partAttrs(timeline({ id: "c", feed: true }).part("item", { value: "a" }))
        .role
    ).toBe("article")
  })

  test("the first item holds the tab stop before items bind", () => {
    const instance = timeline({ id: "c" })
    expect(partAttrs(instance.part("item", { value: "a" })).tabindex).toBe("0")
    expect(partAttrs(instance.part("item", { value: "b" })).tabindex).toBe("-1")
  })

  test("the current item says it's the current step", () => {
    const item = timeline({ id: "c" }).part("item", {
      value: "a",
      status: "current",
    })
    expect(partAttrs(item)).toMatchObject({
      "aria-current": "step",
      "data-current": "",
      "data-complete": undefined,
    })
    expect(partState(item)).toEqual({
      status: "current",
      orientation: "vertical",
    })
  })

  test("markers and connectors are hidden from assistive technology", () => {
    const instance = timeline({ id: "c" })
    for (const slot of ["marker", "connector"] as const) {
      expect(
        partAttrs(instance.part(slot, { value: "a", status: "complete" }))
      ).toMatchObject({ "aria-hidden": "true", "data-complete": "" })
    }
  })

  test("the current item takes the tab stop once items bind", async () => {
    const instance = timeline({ id: "c" })
    const values = ["a", "b", "c"]
    values.forEach((value, index) =>
      bind(
        instance.part("item", {
          value,
          status: value === "b" ? "current" : "complete",
        }),
        fakeElement(index, "LI")
      )
    )
    await Promise.resolve()
    expect(instance.get()).toMatchObject({ stop: "b", first: "a", last: "c" })
  })

  test("an item is named by its title and described by its time and description", async () => {
    const instance = timeline({ id: "c" })
    const item = instance.part("item", { value: "a" })
    bind(item, fakeElement(0, "LI"))
    bind(instance.part("title", { value: "a" }), fakeElement(1, "DIV"))
    bind(instance.part("time", { value: "a" }), fakeElement(2, "TIME"))
    await Promise.resolve()
    expect(partAttrs(item)["aria-labelledby"]).toBe("c-title-a")
    expect(liveAttrs(item)).toMatchObject({
      "aria-describedby": "c-time-a",
      "data-first": "",
      "data-last": "",
      "aria-posinset": undefined,
    })
  })

  test("a feed's articles say where they sit", async () => {
    const instance = timeline({ id: "c", feed: true })
    const items = ["a", "b"].map((value, index) => {
      const item = instance.part("item", { value })
      bind(item, fakeElement(index, "LI"))
      return item
    })
    await Promise.resolve()
    expect(liveAttrs(items[1])).toMatchObject({
      "aria-posinset": "2",
      "aria-setsize": "2",
    })
  })
})
