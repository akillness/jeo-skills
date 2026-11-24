import { describe, expect, test } from "vitest"
import { menu } from "./menu-parts"
import { attrs, partState, press } from "../src/foundation/kernel/part"

// Servers run the core with no document or window. Every api call must work there.
describe("menu without a DOM", () => {
  test("there is no document in this environment", () => {
    expect(typeof document).toBe("undefined")
  })

  test("opening, closing, toggling and running actions never touch the DOM", () => {
    const actions: string[] = []
    const changes: boolean[] = []
    const instance = menu({
      id: "headless",
      onAction: (value: string) => actions.push(value),
      onOpenChange: (open: boolean) => changes.push(open),
    })
    const { api } = instance
    api.open()
    api.close()
    api.toggle()
    api.toggle()
    api.open()
    api.action("rename")
    const sub = menu({ id: "headless-sub", parent: api })
    api.open()
    sub.api.open()
    sub.api.close()
    sub.api.action("move")
    expect(actions).toEqual(["rename", "move"])
    expect(changes).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ])
    expect(instance.get().open).toBe(false)
  })

  test("pressing parts runs through the same paths", () => {
    const actions: string[] = []
    const instance = menu({
      id: "press",
      onAction: (value: string) => actions.push(value),
    })
    press(instance.part("trigger"))?.()
    expect(instance.get().open).toBe(true)
    press(instance.part("item", { value: "share" }))?.()
    expect(actions).toEqual(["share"])
    expect(instance.get().open).toBe(false)
  })

  test("destructive items say so in their attributes", () => {
    const instance = menu({ id: "attrs" })
    expect(
      attrs(instance.part("item", { value: "delete", destructive: true }))[
        "data-destructive"
      ]
    ).toBe("")
    expect(
      attrs(instance.part("item", { value: "rename" }))["data-destructive"]
    ).toBeUndefined()
  })
})

describe("menu presses without a DOM", () => {
  test("onSelect gets a real select Event it can cancel, which keeps the menu open", () => {
    const actions: string[] = []
    const instance = menu({
      id: "select",
      onAction: (value: string) => actions.push(value),
    })
    instance.api.open()
    let received: Event | undefined
    press(
      instance.part("item", {
        value: "pin",
        onSelect: (event?: Event) => {
          received = event
          event?.preventDefault()
        },
      })
    )?.()
    expect(received).toBeInstanceOf(Event)
    expect(received).toMatchObject({
      type: "select",
      cancelable: true,
      defaultPrevented: true,
      target: null,
    })
    expect(received?.timeStamp).toEqual(expect.any(Number))
    expect(instance.get().open).toBe(true)
    expect(actions).toEqual([])
    press(instance.part("item", { value: "copy", onSelect: () => {} }))?.()
    expect(actions).toEqual(["copy"])
    expect(instance.get().open).toBe(false)
  })

  test("a disabled submenu trigger never opens its submenu", () => {
    const root = menu({ id: "root" })
    const sub = menu({ id: "sub", parent: root.api })
    root.api.open()
    expect(attrs(sub.part("trigger", { disabled: true }))).toMatchObject({
      "aria-disabled": "true",
      "data-disabled": "",
    })
    expect(partState(sub.part("trigger", { disabled: true }))).toEqual({
      open: false,
      disabled: true,
    })
    press(sub.part("trigger", { disabled: true }))?.()
    expect(sub.get().open).toBe(false)
    press(sub.part("trigger", {}))?.()
    expect(sub.get().open).toBe(true)
  })

  test("choosing the selected radio item still closes a menu that closes on select", () => {
    const changes: string[] = []
    const instance = menu({
      id: "radio-close",
      onValueChange: (value: string) => changes.push(value),
    })
    const item = { group: "account", value: "personal", closeOnSelect: true }
    instance.api.open()
    press(instance.part("radio-item", item))?.()
    expect(instance.get().open).toBe(false)
    instance.api.open()
    press(instance.part("radio-item", item))?.()
    expect(instance.get().open).toBe(false)
    expect(changes).toEqual(["personal"])
  })

  test("choosing the selected radio item keeps a menu open by default", () => {
    const instance = menu({ id: "radio-open" })
    const item = { group: "sort", value: "name" }
    instance.api.open()
    press(instance.part("radio-item", item))?.()
    press(instance.part("radio-item", item))?.()
    expect(instance.get().open).toBe(true)
  })

  test("a disabled root trigger is a disabled button that never opens the menu", () => {
    const root = menu({ id: "root-trigger" })
    expect(attrs(root.part("trigger", { disabled: true }))).toMatchObject({
      disabled: "",
      "data-disabled": "",
    })
    expect(
      attrs(root.part("trigger", { disabled: true }))["aria-disabled"]
    ).toBeUndefined()
    expect(partState(root.part("trigger", { disabled: true }))).toEqual({
      open: false,
      disabled: true,
    })
    press(root.part("trigger", { disabled: true }))?.()
    expect(root.get().open).toBe(false)
  })
})
