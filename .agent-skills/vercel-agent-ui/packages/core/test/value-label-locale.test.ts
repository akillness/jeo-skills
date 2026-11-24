// @vitest-environment jsdom
// A value's labels join in English on the server, so the first client render
// must too, whatever the page's language. Once a part binds, they join in it.
import { afterEach, describe, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { select } from "../src/components/select/select"
import { bind, partState } from "../src/foundation/kernel/part"

const items = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "orange", label: "Orange" },
]
const options = {
  items,
  multiple: true,
  defaultValue: ["apple", "banana", "orange"],
}
const valueProps = {
  maxLabels: 1,
  getMoreLabel: (count: number) => `${count} más`,
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute("lang")
})

describe("on a Spanish page", () => {
  test("a Select's value joins its labels like the server's until the trigger binds, then in Spanish", async () => {
    document.documentElement.lang = "es"
    const instance = select({ id: "fruit", ...options })
    const label = () => partState(instance.part("value", valueProps)).label
    expect(label()).toBe("Apple and 2 más")
    const trigger = document.body.appendChild(document.createElement("button"))
    const unbind = bind(instance.part("trigger"), trigger)
    await settle()
    expect(label()).toBe("Apple y 2 más")
    unbind()
  })

  test("a Combobox's value joins its labels like the server's until the input binds, then in Spanish", async () => {
    document.documentElement.lang = "es"
    const instance = combobox({ id: "fruit", ...options })
    const label = () => partState(instance.part("value", valueProps)).label
    expect(label()).toBe("Apple and 2 más")
    const input = document.body.appendChild(document.createElement("input"))
    const unbind = bind(instance.part("input"), input)
    await settle()
    expect(label()).toBe("Apple y 2 más")
    unbind()
  })

  test("a Combobox whose input is in its popup joins them in Spanish once its trigger binds", async () => {
    document.documentElement.lang = "es"
    const instance = combobox({ id: "fruit", ...options })
    const label = () => partState(instance.part("value", valueProps)).label
    const trigger = document.body.appendChild(document.createElement("button"))
    const unbind = bind(instance.part("trigger"), trigger)
    await settle()
    expect(label()).toBe("Apple y 2 más")
    unbind()
  })
})
