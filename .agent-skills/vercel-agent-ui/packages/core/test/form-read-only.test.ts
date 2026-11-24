import { describe, expect, test } from "vitest"
import { checkbox, checkboxGroup } from "../src/components/checkbox/checkbox"
import { slider } from "../src/components/slider/slider"
import { attrs, partState, press } from "../src/foundation/kernel/part"

const key = (name: string) => {
  const event = {
    key: name,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault: () => (event.defaultPrevented = true),
  }
  return event as unknown as KeyboardEvent & { defaultPrevented: boolean }
}

describe("a read-only checkbox group", () => {
  test("makes its checkboxes read-only, so a press changes nothing", () => {
    const group = checkboxGroup({ id: "g", readOnly: true })
    const child = checkbox({ id: "c", value: "a", group: () => group.api })
    expect(attrs(group.part("group"))["data-readonly"]).toBe("")
    expect(partState(group.part("group"))).toMatchObject({ readOnly: true })
    expect(child.get().readOnly).toBe(true)
    press(child.part("root"))?.()
    expect(group.api.getValue()).toEqual([])
  })
})

describe("a read-only slider", () => {
  test("keeps its value through keys and adjustments, and says so", () => {
    const instance = slider({
      id: "s",
      defaultValue: 50,
      readOnly: true,
      required: true,
    })
    const event = key("ArrowRight")
    instance.api.internal.keydown(event, 0, {} as HTMLElement)
    expect(event.defaultPrevented).toBe(true)
    instance.api.internal.adjust(0, 70, {} as Event)
    expect(instance.api.getValue()).toBe(50)
    expect(partState(instance.part("root"))).toMatchObject({
      readOnly: true,
      required: true,
    })
    expect(attrs(instance.part("root"))).toMatchObject({
      "data-readonly": "",
      "data-required": "",
    })
    expect(
      attrs(instance.part("thumb-input", { index: 0 }))["aria-readonly"]
    ).toBe("true")
  })
})
