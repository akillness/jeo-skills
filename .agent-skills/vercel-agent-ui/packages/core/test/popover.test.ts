import { describe, expect, test } from "vitest"
import { computeArrow } from "../src/foundation/platform/position"
import { bridgeBetween } from "../src/foundation/popups/bridge"
import { popover } from "../src/components/popover/popover"
import {
  attrs as partAttrs,
  partState,
  press,
} from "../src/foundation/kernel/part"

describe("arrow", () => {
  const arrow = { width: 12, height: 6 }

  test("points at the anchor's center", () => {
    const anchor = { x: 100, y: 0, width: 60, height: 30 }
    const popup = { x: 50, y: 40, width: 200, height: 100 }
    expect(computeArrow(anchor, popup, arrow, "bottom", 6)).toEqual({
      offset: 74,
      clamped: false,
    })
  })

  test("stops short of the corners and says so", () => {
    const anchor = { x: 0, y: 0, width: 10, height: 30 }
    const popup = { x: 40, y: 40, width: 200, height: 100 }
    expect(computeArrow(anchor, popup, arrow, "bottom", 6)).toEqual({
      offset: 6,
      clamped: true,
    })
  })

  test("runs along the vertical edge for side placements", () => {
    const anchor = { x: 0, y: 100, width: 30, height: 40 }
    const popup = { x: 40, y: 60, width: 200, height: 100 }
    expect(
      computeArrow(anchor, popup, { width: 6, height: 12 }, "right", 6).offset
    ).toBe(54)
  })
})

describe("hover bridge", () => {
  const trigger = { left: 100, right: 160, top: 0, bottom: 30 }
  const popup = { left: 50, right: 250, top: 38, bottom: 200 }

  test("covers the gap between the trigger and the popup", () => {
    expect(bridgeBetween(trigger, popup)(130, 34)).toBe(true)
  })

  test("covers a path that leaves the trigger sideways toward the popup", () => {
    expect(bridgeBetween(trigger, popup)(85, 25)).toBe(true)
  })

  test("excludes anything beside the trigger away from the popup", () => {
    expect(bridgeBetween(trigger, popup)(40, 15)).toBe(false)
    expect(bridgeBetween(trigger, popup)(130, -10)).toBe(false)
  })

  test("works for popups above the trigger", () => {
    const above = { left: 50, right: 250, top: -200, bottom: -8 }
    expect(bridgeBetween(trigger, above)(130, -4)).toBe(true)
    expect(bridgeBetween(trigger, above)(130, 40)).toBe(false)
  })
})

describe("state", () => {
  test("before its parts bind, a popover is named by its trigger and described by nothing", () => {
    const instance = popover({ id: "p", defaultOpen: true })
    expect(partAttrs(instance.part("content"))["aria-labelledby"]).toBe(
      "p-trigger"
    )
    expect(
      partAttrs(instance.part("content"))["aria-describedby"]
    ).toBeUndefined()
  })

  test("only modal popovers are marked modal", () => {
    expect(
      partAttrs(popover({ id: "p", defaultOpen: true }).part("content"))[
        "aria-modal"
      ]
    ).toBeUndefined()
    expect(
      partAttrs(
        popover({ id: "p", defaultOpen: true, modal: true }).part("content")
      )["aria-modal"]
    ).toBe("true")
    expect(
      partAttrs(
        popover({ id: "p", defaultOpen: true, modal: "trap-focus" }).part(
          "content"
        )
      )["aria-modal"]
    ).toBeUndefined()
  })

  test("a cancelled change keeps the popover closed", () => {
    const instance = popover({
      id: "p",
      onOpenChange: (open, details) => details.cancel(),
    })
    instance.api.open()
    expect(instance.get()).toMatchObject({ open: false, mounted: false })
  })

  test("a controlled popover reports changes without applying them", () => {
    const changes: boolean[] = []
    const instance = popover({
      id: "p",
      open: false,
      onOpenChange: (open) => changes.push(open),
    })
    instance.api.open()
    expect(changes).toEqual([true])
    expect(instance.get()).toMatchObject({ open: false })
  })

  test("a trigger that takes over an open popover anchors it instead of the controller's anchor", () => {
    const instance = popover({ id: "p" })
    press(instance.part("trigger", { id: "a" }))?.()
    instance.api.close()
    const point = { x: 10, y: 20 }
    instance.api.open({ anchor: point })
    expect(instance.api.internal.control.anchor()).toBe(point)
    press(instance.part("trigger", { id: "b", payload: "row b" }))?.()
    expect(instance.get()).toMatchObject({
      open: true,
      trigger: "b",
      payload: "row b",
    })
    expect(instance.api.internal.control.anchor()).not.toBe(point)
  })

  test("a controller's new payload on the open popover moves it to the anchor passed with it", () => {
    const instance = popover({ id: "p" })
    const first = { x: 10, y: 20 }
    instance.api.open({ payload: "row a", anchor: first })
    instance.api.open({ payload: "row a", anchor: { x: 0, y: 0 } })
    expect(instance.api.internal.control.anchor()).toBe(first)
    const second = { x: 10, y: 60 }
    instance.api.open({ payload: "row b", anchor: second })
    expect(instance.api.internal.control.anchor()).toBe(second)
    instance.api.open({ payload: "row c" })
    expect(instance.api.internal.control.anchor()).toBe(second)
    instance.api.close()
  })
})

describe("shortcut", () => {
  test("the trigger's shortcut reaches it as aria-keyshortcuts, in neutral names until the client binds", () => {
    const attrs = partAttrs(
      popover({ id: "p" }).part("trigger", { id: "a", shortcut: "mod+i" })
    )
    expect(attrs["aria-keyshortcuts"]).toBe("Control+I")
  })

  test("the shortcut part shows the keys in neutral names until the client binds", () => {
    const instance = popover({ id: "p" })
    expect(partState(instance.part("shortcut", { shortcut: "mod+i" }))).toEqual(
      { text: "⁦Ctrl+I⁩" }
    )
  })

  test("the shortcut part is hidden from screen readers, which hear aria-keyshortcuts", () => {
    expect(
      partAttrs(popover({ id: "p" }).part("shortcut", { shortcut: "mod+i" }))[
        "aria-hidden"
      ]
    ).toBe("true")
  })

  test("a shortcut part without a shortcut is empty", () => {
    expect(partState(popover({ id: "p" }).part("shortcut", {}))).toEqual({
      text: "",
    })
  })
})
