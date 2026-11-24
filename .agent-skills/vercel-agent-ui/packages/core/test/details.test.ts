import { describe, expect, expectTypeOf, test } from "vitest"
import type { DialogOpenChangeDetails } from "../src/components/dialog/dialog"
import { sourceOf } from "../src/foundation/kernel/modality"
import {
  createMenuController,
  menu,
  type MenuOpenChangeReason,
} from "../src/components/menu/menu"
import type { PopoverOpenChangeReason } from "../src/components/popover/popover"
import { changeSource } from "../src/foundation/kernel/input-source"
import {
  isDismissal,
  type ChangeDetails,
  type ChangeSource,
  withSource,
} from "../src/foundation/kernel/details"

// Stand-ins for DOM events, since these tests run without a DOM.
const event = (type: string, init: Record<string, unknown> = {}) =>
  ({ type, isTrusted: true, ...init }) as unknown as Event

describe("source", () => {
  test("keys are the keyboard, and pointers say which kind they are", () => {
    expect(sourceOf(event("keydown"))).toBe("keyboard")
    expect(
      sourceOf(
        event("pointerdown", { pointerType: "mouse", width: 1, height: 1 })
      )
    ).toBe("mouse")
    expect(
      sourceOf(
        event("pointerup", { pointerType: "touch", width: 20, height: 20 })
      )
    ).toBe("touch")
    expect(
      sourceOf(
        event("pointerdown", { pointerType: "pen", width: 1, height: 1 })
      )
    ).toBe("pen")
  })

  test("a click with no pointer or key behind it is virtual", () => {
    expect(sourceOf(event("click", { detail: 0 }))).toBe("virtual")
  })

  test("a pointer with no size and no pressure is made up, so virtual", () => {
    expect(
      sourceOf(
        event("pointerdown", {
          pointerType: "touch",
          width: 0,
          height: 0,
          pressure: 0,
        })
      )
    ).toBe("virtual")
  })

  test("an event a script dispatched is programmatic", () => {
    expect(sourceOf(event("click", { isTrusted: false, detail: 1 }))).toBe(
      "programmatic"
    )
  })

  test("controllers, removed items and resets are programmatic, whatever the event", () => {
    for (const reason of [
      "imperative",
      "item-removed",
      "unmount",
      "reset",
      "restore",
    ]) {
      expect(changeSource(reason, event("keydown"))).toBe("programmatic")
    }
  })

  test("a change without an event takes the source of the change that caused it", () => {
    expect(changeSource("parent-close")).toBe("programmatic")
    expect(withSource("keyboard", () => changeSource("parent-close"))).toBe(
      "keyboard"
    )
    // A click core sends for a key keeps the key.
    expect(
      withSource("keyboard", () =>
        changeSource("item-press", event("click", { isTrusted: false }))
      )
    ).toBe("keyboard")
  })

  test("closing a menu with a key closes its open submenu with the same source", () => {
    const sources: ChangeSource[] = []
    const root = menu({ id: "root" })
    const child = menu({
      id: "child",
      parent: root.api,
      onOpenChange: (_, details) => sources.push(details.source),
    })
    root.api.show({ event: event("keydown", { key: "ArrowDown" }) })
    child.api.show({
      reason: "trigger-press",
      event: event("keydown", { key: "ArrowRight" }),
    })
    root.api.hide({
      reason: "escape-key",
      event: event("keydown", { key: "Escape" }),
    })
    expect(sources).toEqual(["keyboard", "keyboard"])
  })

  test("a change's source comes from its reason and its event", () => {
    expect(changeSource("escape-key", event("keydown"))).toBe("keyboard")
    expect(changeSource("imperative")).toBe("programmatic")
  })
})

describe("dismissals", () => {
  test("isDismissal groups the reasons that dismiss a layer", () => {
    for (const reason of [
      "escape-key",
      "outside-press",
      "focus-out",
      "window-blur",
      "back",
      "swipe",
    ]) {
      expect(isDismissal(reason)).toBe(true)
    }
    for (const reason of [
      "trigger-press",
      "close-press",
      "item-press",
      "imperative",
      "action",
    ]) {
      expect(isDismissal(reason)).toBe(false)
    }
  })
})

describe("types", () => {
  test("checking the reason narrows the event", () => {
    const check = (details: ChangeDetails<PopoverOpenChangeReason>) => {
      if (details.reason === "escape-key") {
        expectTypeOf(details.event).toEqualTypeOf<KeyboardEvent | undefined>()
      }
      if (details.reason === "imperative") {
        expectTypeOf(details.event).toEqualTypeOf<undefined>()
      }
      if (details.reason === "trigger-hover") {
        expectTypeOf(details.event).toEqualTypeOf<PointerEvent | undefined>()
      }
      expectTypeOf(details.source).toEqualTypeOf<ChangeSource>()
    }
    expect(check).toBeTypeOf("function")
  })

  test("extra fields survive the union, like a dialog's returnValue", () => {
    const check = (details: DialogOpenChangeDetails) => {
      if (details.reason === "close-press") {
        expectTypeOf(details.returnValue).toEqualTypeOf<string | undefined>()
        expectTypeOf(details.event).toEqualTypeOf<
          MouseEvent | KeyboardEvent | SubmitEvent | undefined
        >()
      }
    }
    expect(check).toBeTypeOf("function")
  })

  test("a string reason keeps the loose shape", () => {
    expectTypeOf<ChangeDetails["event"]>().toEqualTypeOf<Event | undefined>()
  })

  test("controller results are typed by the component's reasons and the result type", () => {
    const controller = createMenuController()
    type Result = Awaited<ReturnType<typeof controller.open>>
    expectTypeOf<Result["reason"]>().toEqualTypeOf<
      MenuOpenChangeReason | "unmount"
    >()
    expect(controller).toBeTruthy()
  })
})
