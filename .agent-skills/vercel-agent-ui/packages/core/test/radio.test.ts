import { describe, expect, test } from "vitest"
import { radioGroup } from "../src/components/radio/radio"
import { attrs } from "../src/foundation/kernel/part"

describe("radio group", () => {
  test("a controller can't check a disabled radio before any element binds", () => {
    // Before anything binds, the item's rendered props decide.
    const instance = radioGroup({ id: "r" })
    attrs(instance.part("root", { value: "a", disabled: true }))
    attrs(instance.part("root", { value: "b" }))
    expect(instance.api.setValue("a")).toBe(false)
    expect(instance.get().value).toBeNull()
    expect(instance.api.setValue("b")).toBe(true)
    expect(instance.get().value).toBe("b")
  })
})
