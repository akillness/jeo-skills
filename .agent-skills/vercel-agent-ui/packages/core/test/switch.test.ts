import { describe, expect, test } from "vitest"
import { switchPrimitive } from "../src/components/switch/switch"
import { attrs, partState } from "../src/foundation/kernel/part"

describe("switch", () => {
  test("the thumb carries the switch's state attributes, and never indeterminate", () => {
    const on = switchPrimitive({
      id: "s",
      defaultChecked: true,
      readOnly: true,
      required: true,
    })
    expect(attrs(on.part("root"))).toMatchObject({
      role: "switch",
      "aria-checked": "true",
      "aria-readonly": "true",
      "aria-required": "true",
      "data-checked": "",
    })
    expect(attrs(on.part("thumb"))).toMatchObject({
      "data-checked": "",
      "data-readonly": "",
      "data-required": "",
    })
    expect(attrs(on.part("thumb"))["data-indeterminate"]).toBeUndefined()
    expect(partState(on.part("thumb"))).toEqual({
      checked: true,
      disabled: false,
      readOnly: true,
      required: true,
    })

    const off = switchPrimitive({ id: "s" })
    expect(attrs(off.part("root"))["aria-checked"]).toBe("false")
    expect(attrs(off.part("thumb"))).toMatchObject({ "data-unchecked": "" })
  })

  test("read-only and disabled switches ignore changes", () => {
    const readOnly = switchPrimitive({ id: "s", readOnly: true })
    expect(readOnly.api.toggle({ reason: "press" })).toBe(false)
    expect(readOnly.api.getChecked()).toBe(false)

    const disabled = switchPrimitive({
      id: "s",
      defaultChecked: true,
      disabled: true,
    })
    expect(disabled.api.setChecked(false)).toBe(false)
    expect(disabled.api.getChecked()).toBe(true)
  })

  test("a canceled press keeps the state, and the controller's change applies it later", () => {
    const reasons: string[] = []
    const control = switchPrimitive({
      id: "s",
      onCheckedChange: (_checked, details) => {
        reasons.push(details.reason)
        if (details.reason !== "imperative") {
          details.cancel()
        }
      },
    })
    expect(control.api.toggle({ reason: "press" })).toBe(false)
    expect(control.api.getChecked()).toBe(false)
    expect(control.api.setChecked(true)).toBe(true)
    expect(control.api.getChecked()).toBe(true)
    expect(reasons).toEqual(["press", "imperative"])
  })

  test("a form reset returns it to defaultChecked, with the reset reason", () => {
    const reasons: string[] = []
    const control = switchPrimitive({
      id: "s",
      defaultChecked: true,
      onCheckedChange: (_checked, details) => reasons.push(details.reason),
    })
    control.api.toggle({ reason: "press" })
    expect(control.api.getChecked()).toBe(false)
    control.api.internal.reset()
    expect(control.api.getChecked()).toBe(true)
    expect(reasons).toEqual(["press", "reset"])
  })
})
