import { describe, expect, test, vi } from "vitest"
import {
  accordion,
  createAccordionController,
} from "../src/components/accordion/accordion"
import { idPart } from "../src/foundation/kernel/attrs"
import { renderVersion } from "../src/foundation/kernel/primitive"
import { createStore, sameValue } from "../src/foundation/kernel/store"
import { attrs, partState, present } from "../src/foundation/kernel/part"
import { kept } from "./kept"

describe("values", () => {
  test("single mode keeps one item open", () => {
    const instance = accordion({ id: "x", defaultValue: ["a"] })
    instance.api.open("b")
    expect(instance.api.getValue()).toEqual(["b"])
    instance.api.close("b")
    expect(instance.api.getValue()).toEqual([])
  })

  test("multiple mode adds and removes items in order", () => {
    const instance = accordion({ id: "x", multiple: true, defaultValue: ["a"] })
    instance.api.open("b")
    expect(instance.api.getValue()).toEqual(["a", "b"])
    instance.api.open("a")
    expect(instance.api.getValue()).toEqual(["a", "b"])
    instance.api.close("a")
    expect(instance.api.getValue()).toEqual(["b"])
  })

  test("arrays with the same items are the same value", () => {
    expect(sameValue(["a", "b"], ["a", "b"])).toBe(true)
    expect(sameValue(["a", "b"], ["b", "a"])).toBe(false)
    expect(sameValue([], [])).toBe(true)
    expect(sameValue("a", "a")).toBe(true)
    expect(sameValue(["a"], "a")).toBe(false)
  })

  test("a store doesn't render again for an equal array", () => {
    const store = createStore({ value: ["a"] }, [])
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ value: ["a"] })
    expect(listener).not.toHaveBeenCalled()
    store.set({ value: ["a", "b"] })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("ids", () => {
  test("values with spaces still make valid id references", () => {
    const instance = accordion({ id: "x", defaultValue: ["two words"] })
    const trigger = attrs(instance.part("trigger", { value: "two words" }))
    const panel = attrs(instance.part("panel", { value: "two words" }))
    expect(trigger.id).toBe(`x-trigger-${idPart("two words")}`)
    expect(trigger.id).not.toContain(" ")
    expect(panel["aria-labelledby"]).toBe(trigger.id)
  })
})

describe("rendering", () => {
  test("open items render expanded, others collapsed and hidden", () => {
    const instance = accordion({ id: "x", defaultValue: ["a"] })
    expect(attrs(instance.part("trigger", { value: "a" }))).toMatchObject({
      "aria-expanded": "true",
      "data-open": "",
      "data-closed": undefined,
    })
    expect(attrs(instance.part("trigger", { value: "b" }))).toMatchObject({
      "aria-expanded": "false",
      "data-open": undefined,
      "data-closed": "",
    })
    expect(present(instance.part("panel", { value: "a" }))).toBe(true)
    expect(present(instance.part("panel", { value: "b" }))).toBe(false)
    expect(attrs(instance.part("panel", { value: "a" }))).toMatchObject({
      role: "region",
      hidden: undefined,
    })
  })

  test("closed panels kept mounted are hidden, or hidden until found", () => {
    const kept = accordion({ id: "x", keepMounted: true })
    expect(present(kept.part("panel", { value: "a" }))).toBe(true)
    expect(attrs(kept.part("panel", { value: "a" })).hidden).toBe("")
    const findable = accordion({ id: "x", hiddenUntilFound: true })
    expect(present(findable.part("panel", { value: "a" }))).toBe(true)
    expect(attrs(findable.part("panel", { value: "a" })).hidden).toBe(
      "until-found"
    )
    const panel = accordion({ id: "x" })
    expect(
      attrs(panel.part("panel", { value: "a", hiddenUntilFound: true })).hidden
    ).toBe("until-found")
  })

  test("a disabled item disables its trigger, header and panel", () => {
    const instance = accordion({ id: "x" })
    attrs(instance.part("item", { value: "a", disabled: true }))
    expect(attrs(instance.part("trigger", { value: "a" }))).toMatchObject({
      "aria-disabled": "true",
      "data-disabled": "",
    })
    expect(
      attrs(instance.part("header", { value: "a" }))["data-disabled"]
    ).toBe("")
    expect(partState(instance.part("panel", { value: "a" }))).toEqual({
      open: false,
      disabled: true,
      index: -1,
    })
  })

  test("changing an option renders the parts again", () => {
    const instance = accordion({ id: "x" })
    const version = renderVersion(instance)
    instance.setOptions({ id: "x", disabled: true })
    expect(renderVersion(instance)).toBeGreaterThan(version)
    expect(attrs(instance.part("root"))["data-disabled"]).toBe("")
    expect(
      attrs(instance.part("trigger", { value: "a" }))["aria-disabled"]
    ).toBe("true")
  })
})

describe("opening and closing", () => {
  test("toggling reports the new value and a reason", () => {
    const onValueChange = vi.fn()
    const instance = accordion({ id: "x", defaultValue: ["a"], onValueChange })
    instance.api.toggle("b", { reason: "trigger-press" })
    expect(onValueChange).toHaveBeenCalledWith(
      ["b"],
      expect.objectContaining({ reason: "trigger-press" })
    )
    expect(instance.api.getValue()).toEqual(["b"])
    instance.api.toggle("b")
    expect(instance.api.getValue()).toEqual([])
  })

  test("multiple keeps every open item", () => {
    const instance = accordion({ id: "x", multiple: true, defaultValue: ["a"] })
    instance.api.open("b")
    expect(instance.api.getValue()).toEqual(["a", "b"])
    instance.api.close("a")
    expect(instance.api.getValue()).toEqual(["b"])
  })

  test("without collapsible, the open item stays open and says so", () => {
    const instance = accordion({
      id: "x",
      defaultValue: ["a"],
      collapsible: false,
    })
    expect(
      attrs(instance.part("trigger", { value: "a" }))["aria-disabled"]
    ).toBe("true")
    expect(instance.api.close("a")).toBe(false)
    expect(instance.api.getValue()).toEqual(["a"])
    instance.api.open("b")
    expect(instance.api.getValue()).toEqual(["b"])
    expect(
      attrs(instance.part("trigger", { value: "a" }))["aria-disabled"]
    ).toBeUndefined()
  })

  test("a canceled change keeps the value", () => {
    const instance = accordion({
      id: "x",
      defaultValue: ["a"],
      onValueChange: (_value, details) => details.cancel(),
    })
    instance.api.open("b")
    expect(instance.api.getValue()).toEqual(["a"])
  })

  test("an item hears about its change first, and can cancel it", () => {
    const onValueChange = vi.fn()
    const instance = accordion({ id: "x", onValueChange })
    const onOpenChange = vi.fn(
      (_open: boolean, details: { cancel: () => void }) => details.cancel()
    )
    attrs(instance.part("item", { value: "a", onOpenChange }))
    instance.api.open("a", { reason: "trigger-press" })
    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: "trigger-press" })
    )
    expect(onValueChange).not.toHaveBeenCalled()
    expect(instance.api.getValue()).toEqual([])
  })

  test("a controlled accordion waits for its new value", () => {
    const onValueChange = vi.fn()
    const instance = accordion({ id: "x", value: ["a"], onValueChange })
    instance.api.open("b")
    expect(onValueChange).toHaveBeenCalledWith(["b"], expect.anything())
    expect(instance.api.getValue()).toEqual(["a"])
    instance.setOptions({ id: "x", value: ["b"], onValueChange })
    expect(instance.api.getValue()).toEqual(["b"])
  })

  test("only the item find in page opened shows at once, not one a controlled value opens later", () => {
    const onValueChange = vi.fn()
    const options = {
      id: "x",
      multiple: true,
      hiddenUntilFound: true,
      onValueChange,
    }
    const instance = accordion({ ...options, value: [] })
    instance.api.open("a", { reason: "find-in-page" })
    instance.setOptions({ ...options, value: ["a"] })
    instance.setOptions({ ...options, value: ["a", "b"] })
    expect(instance.api.internal.opening("a")).toBe("instant")
    expect(instance.api.internal.opening("b")).toBe("animate")
  })

  test("a canceled find in page doesn't stop the next opening from animating", () => {
    const options = {
      id: "x",
      hiddenUntilFound: true,
      onValueChange: (
        _value: string[],
        details: { reason: string; cancel: () => void }
      ) => {
        if (details.reason === "find-in-page") {
          details.cancel()
        }
      },
    }
    const instance = accordion({ ...options, value: [] })
    instance.api.open("a", { reason: "find-in-page" })
    instance.setOptions({ ...options, value: ["a"] })
    expect(instance.api.internal.opening("a")).toBe("animate")
  })

  test("a find in page a controlled parent ignores doesn't make its own opening later show at once", () => {
    vi.useFakeTimers()
    const onValueChange = vi.fn()
    const options = { id: "x", hiddenUntilFound: true, onValueChange }
    const instance = accordion({ ...options, value: [] })
    instance.api.open("a", { reason: "find-in-page" })
    expect(onValueChange).toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    instance.setOptions({ ...options, value: ["a"] })
    expect(instance.api.internal.opening("a")).toBe("animate")
    vi.useRealTimers()
  })

  test("a controlled value passed as a new array each time doesn't render again", () => {
    const instance = accordion({ id: "x", value: ["a"] })
    instance.setOptions({ id: "x", value: ["a"] })
    let notified = 0
    instance.subscribe(() => notified++)
    instance.setOptions({ id: "x", value: ["a"] })
    expect(notified).toBe(0)
  })

  test("setting the value in single mode keeps the first item", () => {
    const instance = accordion({ id: "x" })
    instance.api.setValue(["a", "b"])
    expect(instance.api.getValue()).toEqual(["a"])
  })

  test("a controller drives the accordion from anywhere", () => {
    const controller = createAccordionController()
    const instance = kept(accordion({ id: "x", multiple: true, controller }))
    instance.setOptions({ id: "x", multiple: true, controller })
    controller.open("a")
    controller.toggle("b")
    expect(controller.getValue()).toEqual(["a", "b"])
    controller.close("a")
    controller.setValue(["c"])
    expect(instance.api.getValue()).toEqual(["c"])
  })
})

describe("items", () => {
  // Items register one by one as they mount, so indexes land a microtask after the last.
  test("an item's index follows the order items register in", async () => {
    const instance = accordion({ id: "x" })
    const a = instance.api.internal.registerItem("a", {} as Element)
    instance.api.internal.registerItem("b", {} as Element)
    await Promise.resolve()
    expect(partState(instance.part("trigger", { value: "b" })).index).toBe(1)
    a()
    await Promise.resolve()
    expect(partState(instance.part("trigger", { value: "b" })).index).toBe(0)
    expect(partState(instance.part("trigger", { value: "a" })).index).toBe(-1)
  })

  test("closing one item to open another tells both items", () => {
    const calls: string[] = []
    const instance = accordion({ id: "x", defaultValue: ["a"] })
    for (const value of ["a", "b"]) {
      attrs(
        instance.part("item", {
          value,
          onOpenChange: (open: boolean) => calls.push(`${value}:${open}`),
        })
      )
    }
    instance.api.open("b")
    expect(calls.sort()).toEqual(["a:false", "b:true"])
  })

  test("an item that refuses to close keeps the others closed too", () => {
    const instance = accordion({ id: "x", defaultValue: ["a"] })
    attrs(
      instance.part("item", {
        value: "a",
        onOpenChange: (open: boolean, details: { cancel: () => void }) =>
          !open && details.cancel(),
      })
    )
    expect(instance.api.open("b")).toBe(false)
    expect(instance.api.getValue()).toEqual(["a"])
  })

  test("openAll opens every enabled item, and closeAll closes them", () => {
    const instance = accordion({ id: "x", multiple: true })
    for (const value of ["a", "b", "c"]) {
      instance.api.internal.registerItem(value, {} as Element)
    }
    attrs(instance.part("item", { value: "b", disabled: true }))
    instance.api.openAll()
    expect(instance.api.getValue()).toEqual(["a", "c"])
    instance.api.closeAll({ reason: "imperative" })
    expect(instance.api.getValue()).toEqual([])
  })

  test("closeAll leaves the one item that must stay open", () => {
    const instance = accordion({
      id: "x",
      defaultValue: ["a"],
      collapsible: false,
    })
    instance.api.closeAll()
    expect(instance.api.getValue()).toEqual(["a"])
  })

  test("details say whether they were canceled", () => {
    let seen: { canceled: boolean } | undefined
    const instance = accordion({
      id: "x",
      onValueChange: (_value, details) => {
        details.cancel()
        seen = details
      },
    })
    instance.api.open("a")
    expect(seen?.canceled).toBe(true)
  })
})
