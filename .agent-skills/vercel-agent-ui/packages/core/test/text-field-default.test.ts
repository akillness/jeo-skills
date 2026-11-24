// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { input } from "../src/components/input/input"
import { attrs, bind } from "../src/foundation/kernel/part"

const unbinds: (() => void)[] = []
afterEach(() => unbinds.splice(0).forEach((unbind) => unbind()))

// A default the browser changes on its way into the field, and what it holds then.
const defaults = [
  ["number", "abc", ""],
  ["text", "Ada\nLovelace", "AdaLovelace"],
] as const

for (const [type, defaultValue, value] of defaults) {
  test(`the default of a ${type} input reads back as the browser keeps it`, () => {
    const el = document.body.appendChild(document.createElement("input"))
    el.type = type
    const instance = input({ id: "i", defaultValue })
    unbinds.push(bind(instance.part("root"), el))
    expect(el.value).toBe(value)
    expect(instance.api.getValue()).toBe(value)
    expect(attrs(instance.part("root"))["data-filled"]).toBe(
      value ? "" : undefined
    )
  })
}
