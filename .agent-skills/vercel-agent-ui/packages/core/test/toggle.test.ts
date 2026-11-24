import { describe, expect, test, vi } from "vitest"
import { runAction } from "../src/foundation/kernel/action"
import { button } from "../src/components/button/button"
import { inOrder, rovingStop } from "../src/foundation/focus/collection"
import {
  buttonElementAttrs,
  buttonRole,
} from "../src/foundation/platform/button"
import { separator } from "../src/components/separator/separator"
import { toggle, toggleGroup } from "../src/components/toggle/toggle"
import { nextValue } from "../src/components/toggle/toggle-group"
import { attrs as partAttrs, partState } from "../src/foundation/kernel/part"

describe("button attributes", () => {
  test("a native button keeps its type and is natively disabled", () => {
    expect(
      buttonElementAttrs("button", {
        type: "submit",
        disabled: false,
        focusable: false,
      })
    ).toEqual({
      type: "submit",
    })
    expect(
      buttonElementAttrs("button", {
        type: "button",
        disabled: true,
        focusable: false,
      })
    ).toMatchObject({
      disabled: "",
      "aria-disabled": undefined,
    })
  })

  test("a focusable disabled button uses aria-disabled and stays in the tab order", () => {
    expect(
      buttonElementAttrs("button", {
        type: "button",
        disabled: true,
        focusable: true,
      })
    ).toMatchObject({
      disabled: undefined,
      "aria-disabled": "true",
      tabindex: undefined,
    })
  })

  test("a link stays a link, and leaves the tab order when disabled", () => {
    expect(
      buttonElementAttrs("link", {
        type: "button",
        disabled: false,
        focusable: false,
      })
    ).toEqual({})
    expect(buttonRole(() => "link").role({}, { key: "" })).toBeUndefined()
    expect(
      buttonElementAttrs("link", {
        type: "button",
        disabled: true,
        focusable: false,
      })
    ).toMatchObject({
      type: undefined,
      "aria-disabled": "true",
      tabindex: "-1",
    })
  })

  test("any other element becomes a focusable button", () => {
    expect(buttonRole(() => "other").role({}, { key: "" })).toBe("button")
    expect(
      buttonElementAttrs("other", {
        type: "button",
        disabled: false,
        focusable: false,
      })
    ).toMatchObject({
      tabindex: "0",
      type: undefined,
    })
  })

  test("before it binds, a disabled part is disabled as a button and as a link", () => {
    expect(buttonRole(() => "unknown").role({}, { key: "" })).toBeUndefined()
    expect(
      buttonElementAttrs("unknown", {
        type: "button",
        disabled: false,
        focusable: false,
      })
    ).toEqual({
      type: "button",
    })
    expect(
      buttonElementAttrs("unknown", {
        type: "button",
        disabled: true,
        focusable: false,
      })
    ).toEqual({
      type: "button",
      disabled: "",
      "aria-disabled": "true",
    })
    expect(
      buttonElementAttrs("unknown", {
        type: "button",
        disabled: true,
        focusable: true,
      })
    ).toMatchObject({
      disabled: undefined,
      "aria-disabled": "true",
      tabindex: undefined,
    })
  })

  test("a disabled button renders its pre-bind attributes until it binds", () => {
    const instance = button({ id: "b", disabled: true })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      disabled: "",
      "aria-disabled": "true",
    })
  })

  test("a roving tab stop overrides the default", () => {
    expect(
      buttonElementAttrs("button", {
        disabled: true,
        focusable: true,
        tabindex: "-1",
      })
    ).toMatchObject({
      tabindex: "-1",
      "aria-disabled": "true",
    })
  })
})

describe("actions", () => {
  test("a Promise is pending until it settles, then done", async () => {
    const events: string[] = []
    runAction(() => Promise.resolve(), "mouse", {
      pending: (pending) => events.push(`pending ${pending}`),
      done: () => events.push("done"),
      failed: () => events.push("failed"),
    })
    expect(events).toEqual(["pending true"])
    await Promise.resolve()
    expect(events).toEqual(["pending true", "pending false", "done"])
  })

  test("a throw or a rejection fails with the reason", async () => {
    const failed = vi.fn()
    runAction(
      () => {
        throw new Error("sync")
      },
      "mouse",
      { pending: () => {}, done: () => {}, failed }
    )
    runAction(() => Promise.reject(new Error("async")), "mouse", {
      pending: () => {},
      done: () => {},
      failed,
    })
    await new Promise((resolve) => setTimeout(resolve))
    expect(
      failed.mock.calls.map(([error]) => (error as Error).message)
    ).toEqual(["sync", "async"])
  })
})

describe("button", () => {
  test("a returned Promise makes it pending, and presses wait for it", async () => {
    let finish = () => {}
    const action = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    )
    const instance = button({ id: "b", action })
    instance.api.internal.press()
    expect(partState(instance.part("root"))).toMatchObject({ pending: true })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      "aria-busy": "true",
      "data-pending": "",
    })
    instance.api.internal.press()
    expect(action).toHaveBeenCalledTimes(1)
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(partState(instance.part("root"))).toMatchObject({ pending: false })
    instance.api.internal.press()
    expect(action).toHaveBeenCalledTimes(2)
  })

  test("a rejection is its error until the next press", async () => {
    const instance = button({
      id: "b",
      action: () => Promise.reject("offline"),
    })
    instance.api.internal.press()
    await new Promise((resolve) => setTimeout(resolve))
    expect(partState(instance.part("root"))).toMatchObject({
      pending: false,
      error: "offline",
    })
  })

  test("a disabled button refuses presses and cancels the click", () => {
    const action = vi.fn()
    const instance = button({ id: "b", disabled: true, action })
    const event = { preventDefault: vi.fn() } as unknown as Event
    instance.api.internal.press(event)
    expect(action).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })
})

describe("toggle", () => {
  test("a press flips it and reports the reason", () => {
    const onPressedChange = vi.fn()
    const instance = toggle({ id: "t", onPressedChange })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      "aria-pressed": "false",
      type: "button",
    })
    instance.api.toggle({ reason: "press" })
    expect(onPressedChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: "press" })
    )
    expect(partAttrs(instance.part("root"))).toMatchObject({
      "aria-pressed": "true",
      "data-pressed": "",
    })
  })

  test("a canceled change keeps it as it was", () => {
    const instance = toggle({
      id: "t",
      onPressedChange: (_, details) => details.cancel(),
    })
    expect(instance.api.toggle()).toBe(false)
    expect(instance.api.isPressed()).toBe(false)
  })

  test("a disabled toggle ignores presses", () => {
    const instance = toggle({ id: "t", disabled: true })
    expect(instance.api.toggle()).toBe(false)
    expect(partAttrs(instance.part("root"))).toMatchObject({ disabled: "" })
  })
})

describe("toggle group", () => {
  const group = (options: Parameters<typeof toggleGroup>[0]) =>
    toggleGroup(options)
  const item = (owner: ReturnType<typeof group>, value: string, extra = {}) =>
    toggle({ id: value, value, group: () => owner.api, ...extra })

  test("single mode presses one toggle at a time", () => {
    const owner = group({ id: "g", defaultValue: ["left"] })
    const center = item(owner, "center")
    center.api.toggle({ reason: "press" })
    expect(owner.api.getValue()).toEqual(["center"])
  })

  test("the toggle hears first, then the group, and either can cancel", () => {
    const calls: string[] = []
    const owner = group({
      id: "g",
      onValueChange: (value, details) => {
        calls.push(`group ${value} ${details.reason}`)
      },
    })
    const bold = item(owner, "bold", {
      onPressedChange: (
        pressed: boolean,
        details: { reason: string; cancel: () => void }
      ) => {
        calls.push(`toggle ${pressed} ${details.reason}`)
      },
    })
    bold.api.toggle({ reason: "press" })
    expect(calls).toEqual(["toggle true press", "group bold item-press"])
    const canceled = item(owner, "italic", {
      onPressedChange: (_: boolean, details: { cancel: () => void }) =>
        details.cancel(),
    })
    expect(canceled.api.toggle({ reason: "press" })).toBe(false)
    expect(owner.api.getValue()).toEqual(["bold"])
  })

  test("deselectable={false} keeps the pressed toggle pressed", () => {
    const owner = group({
      id: "g",
      defaultValue: ["left"],
      deselectable: false,
    })
    expect(owner.api.toggle("left")).toBe(false)
    expect(owner.api.getValue()).toEqual(["left"])
    expect(owner.api.toggle("right")).toBe(true)
    expect(owner.api.getValue()).toEqual(["right"])
  })

  test("a disabled group refuses presses", () => {
    const owner = group({ id: "g", disabled: true })
    expect(owner.api.toggle("bold")).toBe(false)
  })

  test("the first eligible toggle claims the tab stop before anything binds", () => {
    const pressed = group({ id: "g", defaultValue: ["right"] })
    expect(partAttrs(item(pressed, "left").part("root")).tabindex).toBe("-1")
    expect(partAttrs(item(pressed, "right").part("root")).tabindex).toBe("0")
    const none = group({ id: "h" })
    expect(
      partAttrs(item(none, "a", { disabled: true }).part("root")).tabindex
    ).toBe("-1")
    expect(partAttrs(item(none, "b").part("root")).tabindex).toBe("0")
    expect(partAttrs(item(none, "c").part("root")).tabindex).toBe("-1")
  })

  test("in a disabled group, the first toggle claims the tab stop before anything binds", () => {
    const owner = group({ id: "g", defaultValue: ["b"], disabled: true })
    expect(partAttrs(item(owner, "a").part("root"))).toMatchObject({
      tabindex: "0",
      "aria-disabled": "true",
    })
    expect(partAttrs(item(owner, "b").part("root")).tabindex).toBe("-1")
  })

  test("disabled toggles in a group stay focusable with aria-disabled", () => {
    const owner = group({ id: "g" })
    expect(
      partAttrs(item(owner, "strike", { disabled: true }).part("root"))
    ).toMatchObject({
      "aria-disabled": "true",
      disabled: undefined,
    })
  })

  test("the tab stop starts on the first pressed enabled toggle, else the first enabled one", () => {
    const toggles = (
      pressed: string[],
      list = ["a", "b", "c"],
      disabled = ["a"]
    ) =>
      list.map((key) => ({
        key,
        disabled: disabled.includes(key),
        focusable: true,
        preferred: pressed.includes(key),
      }))
    expect(rovingStop(toggles(["c"]))).toBe("c")
    expect(rovingStop(toggles(["a"]))).toBe("b")
    expect(rovingStop(toggles([]))).toBe("b")
    expect(rovingStop(toggles([], ["a"]))).toBe("a")
    expect(rovingStop([])).toBeNull()
  })

  test("values keep document order with multiple", () => {
    const order = ["bold", "italic", "underline"]
    expect(
      nextValue(["underline"], "bold", true, { multiple: true, order })
    ).toEqual(["bold", "underline"])
    expect(
      nextValue(["bold", "italic"], "bold", false, { multiple: true, order })
    ).toEqual(["italic"])
    expect(
      nextValue(["left"], "right", true, { multiple: false, order })
    ).toEqual(["right"])
    expect(
      nextValue(["left"], "left", false, { multiple: false, order })
    ).toEqual([])
  })

  test("values without a toggle keep their place at the end", () => {
    expect(
      inOrder(["gone", "underline", "bold"], ["bold", "italic", "underline"])
    ).toEqual(["bold", "underline", "gone"])
  })
})

describe("separator", () => {
  test("is a separator with its orientation, or hidden when decorative", () => {
    const root = separator({ id: "s", orientation: "vertical" }).part("root")
    expect(partAttrs(root)).toEqual({
      "data-slot": "separator",
      role: "separator",
      "aria-orientation": "vertical",
      "data-orientation": "vertical",
    })
    expect(partState(root)).toEqual({ orientation: "vertical" })
    expect(
      partAttrs(separator({ id: "s", decorative: true }).part("root"))
    ).toEqual({
      "data-slot": "separator",
      role: "none",
      "aria-orientation": undefined,
      "data-orientation": "horizontal",
    })
  })

  test("an unknown orientation is horizontal", () => {
    const instance = separator({
      id: "s",
      orientation: "Vertical" as "vertical",
    })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal",
    })
  })

  test("a new orientation or decorative option reaches its attributes", () => {
    const instance = separator({ id: "s" })
    instance.setOptions({ id: "s", orientation: "vertical" })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      role: "separator",
      "aria-orientation": "vertical",
    })
    instance.setOptions({ id: "s", orientation: "vertical", decorative: true })
    expect(partAttrs(instance.part("root"))).toMatchObject({
      role: "none",
      "aria-orientation": undefined,
    })
  })
})
