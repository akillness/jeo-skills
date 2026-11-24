import { describe, expect, test, vi } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import type { Feature } from "../src/foundation/kernel/primitive-types"
import { attrs, directNames, partState } from "../src/foundation/kernel/part"

// A list whose badge part ships with a feature, like a select's select-all
// option. The feature fills a hook its api calls.
const list = definePrimitive({
  name: "list",
  state: () => ({ count: 2 }),
  api: () => {
    const hooks: { label?: () => string } = {}
    return { hooks, label: () => hooks.label?.() ?? "none" }
  },
  slots: (slot) => ({ item: slot({ attrs: () => ({ role: "option" }) }) }),
})

type ListApi = ReturnType<typeof list>["api"]

function badgeFeature() {
  const extend = vi.fn((api: ListApi) => {
    api.hooks.label = () => "badge"
  })
  const feature: Feature<ListApi> = {
    slots: {
      badge: {
        attrs: (state: { count: number }) => ({
          "data-count": String(state.count),
        }),
      },
    },
    extend,
  }
  return { feature, extend }
}

describe("features", () => {
  test("a feature's slots read like the primitive's own once it's used", () => {
    const instance = list({ id: "l" })
    instance.use(badgeFeature().feature)
    expect(attrs(instance.part("item" as never))).toMatchObject({
      role: "option",
    })
    expect(attrs(instance.part("badge" as never))).toMatchObject({
      "data-slot": "list-badge",
      "data-count": "2",
    })
    expect(partState(instance.part("badge" as never))).toEqual({})
    expect(directNames(instance.part("badge" as never))).toBeUndefined()
  })

  test("using a feature again extends the api once", () => {
    const instance = list({ id: "l" })
    const { feature, extend } = badgeFeature()
    instance.use(feature)
    instance.use(feature)
    expect(extend).toHaveBeenCalledTimes(1)
    expect(instance.api.label()).toBe("badge")
  })

  test("features belong to the instance that used them", () => {
    const used = list({ id: "a" })
    const other = list({ id: "b" })
    used.use(badgeFeature().feature)
    expect(used.api.label()).toBe("badge")
    expect(other.api.label()).toBe("none")
  })

  test("a part whose feature no one used warns in development and renders as a plain element", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const instance = list({ id: "l" })
    expect(attrs(instance.part("badge" as never))).toEqual({
      "data-slot": "list-badge",
    })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`the "badge" part isn't defined`)
    )
    warn.mockRestore()
  })
})
