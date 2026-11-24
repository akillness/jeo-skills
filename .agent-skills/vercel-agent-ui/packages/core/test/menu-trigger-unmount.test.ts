// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest"
import { bind, press } from "../src/foundation/kernel/part"
import { menu } from "./menu-parts"

Element.prototype.getAnimations ??= () => []

afterEach(() => document.body.replaceChildren())

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function setup() {
  const instance = menu({ id: "rows" })
  const triggers = ["first", "second"].map((id) => {
    const part = instance.part("trigger", { id, payload: id })
    const el = document.body.appendChild(document.createElement("button"))
    el.textContent = `Actions for ${id}`
    return { part, el, unbind: bind(part, el) }
  })
  const content = instance.part("content")
  const unbindContent = bind(
    content,
    document.body.appendChild(document.createElement("div"))
  )
  return { instance, triggers, unbindContent }
}

describe("a menu whose trigger leaves the page", () => {
  test("closes when the trigger that opened it leaves", async () => {
    const { instance, triggers } = setup()
    await settle()
    press(triggers[0].part)?.()
    expect(instance.get().open).toBe(true)
    triggers[0].unbind()
    triggers[0].el.remove()
    await settle()
    expect(instance.get().open).toBe(false)
  })

  test("stays open when the trigger binds again, like under StrictMode", async () => {
    const { instance, triggers } = setup()
    await settle()
    press(triggers[0].part)?.()
    triggers[0].unbind()
    bind(triggers[0].part, triggers[0].el)
    await settle()
    expect(instance.get().open).toBe(true)
  })

  test("stays open when the trigger binds again a microtask later, like a web component's swapped button", async () => {
    const { instance, triggers } = setup()
    await settle()
    press(triggers[0].part)?.()
    triggers[0].unbind()
    queueMicrotask(() =>
      queueMicrotask(() => bind(triggers[0].part, triggers[0].el))
    )
    await settle()
    expect(instance.get().open).toBe(true)
  })

  test("stays open when another trigger leaves", async () => {
    const { instance, triggers } = setup()
    await settle()
    press(triggers[0].part)?.()
    triggers[1].unbind()
    triggers[1].el.remove()
    await settle()
    expect(instance.get().open).toBe(true)
  })
})
