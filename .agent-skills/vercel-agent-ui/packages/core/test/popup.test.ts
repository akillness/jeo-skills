import { describe, expect, test } from "vitest"
import { onScrollbar } from "../src/foundation/platform/scrollbar"
import { scrollLockStyles, touchOwner } from "../src/foundation/popups/modal"
import {
  createPopupLayer,
  firstUsable,
  initialFocusPlan,
  modalTriple,
  openerOf,
  outsidePressFocus,
  popupTriggerAttrs,
} from "../src/foundation/popups/popup"
import { resolveBehavior } from "../src/foundation/popups/popup-behavior"
import { createStore } from "../src/foundation/kernel/store"

describe("modal", () => {
  test("true and false mean all or none of the three effects", () => {
    expect(modalTriple(true)).toEqual({
      consumeOutsidePress: true,
      trapFocus: true,
      inertAndLock: true,
    })
    expect(modalTriple(false)).toEqual({
      consumeOutsidePress: false,
      trapFocus: false,
      inertAndLock: false,
    })
  })

  test("pointer only consumes the outside press, like a menu's default", () => {
    expect(modalTriple("pointer")).toEqual({
      consumeOutsidePress: true,
      trapFocus: false,
      inertAndLock: false,
    })
  })

  test("trap-focus only traps Tab, and leaves the page usable", () => {
    expect(modalTriple("trap-focus")).toEqual({
      consumeOutsidePress: false,
      trapFocus: true,
      inertAndLock: false,
    })
  })
})

describe("openers", () => {
  // Stand-ins for DOM events, since these tests run without a DOM.
  const event = (type: string, init: Record<string, unknown> = {}) =>
    ({ type, isTrusted: true, detail: 1, ...init }) as unknown as Event

  test("no event is an imperative open, like a controller", () => {
    expect(openerOf()).toBe("imperative")
  })

  test("Enter opens from the keyboard", () => {
    expect(openerOf(event("keydown", { key: "Enter" }))).toBe("keyboard")
  })

  test("a screen reader's click, with no key or pointer press behind it, opens like a key", () => {
    expect(openerOf(event("click", { detail: 0 }))).toBe("keyboard")
  })

  test("a pointerdown is a pointer open, even though its detail is 0", () => {
    expect(
      openerOf(
        event("pointerdown", {
          pointerType: "mouse",
          width: 1,
          height: 1,
          pressure: 0.5,
          detail: 0,
        })
      )
    ).toBe("pointer")
  })

  test("touch is told apart from other pointers", () => {
    expect(
      openerOf(
        event("pointerdown", { pointerType: "touch", width: 20, height: 20 })
      )
    ).toBe("touch")
    expect(
      openerOf(
        event("pointerdown", { pointerType: "pen", width: 1, height: 1 })
      )
    ).toBe("pointer")
  })

  test("a click a script sent is an imperative open", () => {
    expect(openerOf(event("click", { isTrusted: false, detail: 0 }))).toBe(
      "imperative"
    )
  })
})

describe("initial focus", () => {
  test("hover and an open from the start move no focus", () => {
    expect(initialFocusPlan("hover")).toBe("none")
    expect(initialFocusPlan("initial")).toBe("none")
  })

  test("touch focuses the popup itself, so no on-screen keyboard appears", () => {
    expect(initialFocusPlan("touch")).toBe("popup")
  })

  test("everything else asks the component", () => {
    for (const opener of ["pointer", "keyboard", "imperative"] as const) {
      expect(initialFocusPlan(opener)).toBe("auto")
    }
  })
})

describe("focus after an outside press", () => {
  test("stays on a focusable element the press reached", () => {
    expect(
      outsidePressFocus({
        type: "pointerdown",
        focusable: true,
        consumed: false,
      })
    ).toBe(false)
  })

  test("a mouse press on empty space returns focus once the press is over", () => {
    expect(
      outsidePressFocus({
        type: "pointerdown",
        focusable: false,
        consumed: false,
      })
    ).toBe("later")
  })

  test("a tap returns focus at once, since it dismisses on click", () => {
    expect(
      outsidePressFocus({ type: "click", focusable: false, consumed: false })
    ).toBe(true)
  })

  test("a consumed press never reached its target, so focus returns", () => {
    expect(
      outsidePressFocus({
        type: "pointerdown",
        focusable: true,
        consumed: true,
      })
    ).toBe("later")
  })
})

describe("focus return chain", () => {
  test("takes the first candidate that exists and is usable", () => {
    const usable = (value: string) => value !== "inert"
    expect(
      firstUsable(
        [() => undefined, () => "inert", () => "before", () => "neighbour"],
        usable
      )
    ).toBe("before")
    expect(firstUsable([() => null, () => "inert"], usable)).toBeUndefined()
  })

  test("stops at the first usable candidate without looking further", () => {
    const seen: string[] = []
    firstUsable(
      ["trigger", "before"].map((name) => () => (seen.push(name), name)),
      () => true
    )
    expect(seen).toEqual(["trigger"])
  })
})

describe("scrollbar presses", () => {
  const box = {
    width: 200,
    height: 100,
    clientLeft: 1,
    clientTop: 1,
    clientWidth: 183,
    clientHeight: 98,
    borders: { top: 1, right: 1, bottom: 1, left: 1 },
  }

  test("a press on the vertical scrollbar isn't on the content", () => {
    expect(onScrollbar({ x: 190, y: 50 }, box)).toBe(true)
  })

  test("a press on the content or the border isn't on the scrollbar", () => {
    expect(onScrollbar({ x: 100, y: 50 }, box)).toBe(false)
    expect(onScrollbar({ x: 199.5, y: 50 }, box)).toBe(false)
  })

  test("in right-to-left layouts the scrollbar is on the left", () => {
    const rtl = { ...box, clientLeft: 17 }
    expect(onScrollbar({ x: 8, y: 50 }, rtl)).toBe(true)
    expect(onScrollbar({ x: 190, y: 50 }, rtl)).toBe(false)
  })

  test("an element without scrollbars has none to press", () => {
    expect(onScrollbar({ x: 190, y: 50 }, { ...box, clientWidth: 198 })).toBe(
      false
    )
  })
})

describe("scroll lock", () => {
  test("a classic scrollbar keeps its gutter, so the page doesn't shift", () => {
    expect(
      scrollLockStyles({ scrollbar: 15, gutter: true, padding: 0 })
    ).toEqual({
      overflow: "hidden",
      "scroll-behavior": "auto",
      "scrollbar-gutter": "stable",
    })
  })

  test("without scrollbar-gutter support, padding takes the scrollbar's place", () => {
    expect(
      scrollLockStyles({ scrollbar: 15, gutter: false, padding: 10 })[
        "padding-right"
      ]
    ).toBe("25px")
  })

  test("overlay scrollbars reserve nothing, so a short page gains no gutter", () => {
    expect(
      scrollLockStyles({ scrollbar: 0, gutter: true, padding: 0 })
    ).toEqual({
      overflow: "hidden",
      "scroll-behavior": "auto",
    })
  })

  test("on iOS, a one-finger drag that nothing under it can take is the page's, and stopped", () => {
    const start = {
      fingers: 1,
      zoomed: false,
      scroller: false,
      slider: false,
      selecting: false,
    }
    expect(touchOwner(start)).toBe("page")
    expect(touchOwner({ ...start, fingers: 2 })).toBe("browser")
    expect(touchOwner({ ...start, zoomed: true })).toBe("browser")
    expect(touchOwner({ ...start, slider: true })).toBe("element")
    expect(touchOwner({ ...start, selecting: true })).toBe("element")
    expect(touchOwner({ ...start, scroller: true })).toBe("element")
  })
})

describe("without a DOM", () => {
  test("presence follows open, and nothing touches a document", () => {
    const store = createStore({ open: false, mounted: false }, [])
    const reasons: string[] = []
    const popup = createPopupLayer({
      preset: "popover",
      store,
      trigger: () => undefined,
      close: (reason) => reasons.push(reason),
      modal: () => modalTriple(false),
      tab: "flow",
    })
    store.set({ open: true })
    expect(store.get().mounted).toBe(true)
    store.set({ open: false })
    expect(store.get().mounted).toBe(false)
    expect(popup.element()).toBeUndefined()
  })

  test("an open from the start is an initial open, which moves no focus", () => {
    const store = createStore({ open: true, mounted: true }, [])
    const popup = createPopupLayer({
      preset: "popover",
      store,
      trigger: () => undefined,
      close: () => {},
      modal: () => modalTriple(false),
      tab: "flow",
    })
    expect(popup.opener()).toBe("initial")
  })

  test("trigger ARIA only points at the popup while it's mounted", () => {
    expect(
      popupTriggerAttrs({ open: false, mounted: false }, "x", "menu")[
        "aria-controls"
      ]
    ).toBeUndefined()
    expect(
      popupTriggerAttrs({ open: false, mounted: true }, "x", "menu")[
        "aria-controls"
      ]
    ).toBe("x-content")
  })
})

describe("presets", () => {
  test("each kind of popup starts from its preset, and options passed beside it win", () => {
    expect(resolveBehavior("menu", {})).toMatchObject({
      tab: "close",
      blur: "always",
      shield: false,
    })
    expect(resolveBehavior("popover", {})).toMatchObject({
      blur: "iframe",
      dismissOnFocusLoss: true,
    })
    expect(resolveBehavior("dialog", {})).toMatchObject({
      blur: "never",
      outsidePress: "click",
      shield: true,
      keepTrigger: false,
      focusOnMount: true,
      dismissOnFocusLoss: false,
      closeWatcher: true,
    })
    expect(
      resolveBehavior("menu", { blur: "never", shield: undefined }).blur
    ).toBe("never")
    expect(resolveBehavior("dialog", { shield: undefined }).shield).toBe(true)
  })

  test("a dialog and a popover trap Tab only when modal, and a dialog blocks shortcuts only when it locks the page", () => {
    const { tab, blocking } = resolveBehavior("dialog", {})
    const trap = modalTriple(true)
    const none = modalTriple(false)
    expect(
      typeof tab === "function" && [
        tab(trap),
        tab(none),
        tab(modalTriple("trap-focus")),
      ]
    ).toEqual(["trap", "flow", "trap"])
    expect(
      typeof blocking === "function" && [
        blocking(trap),
        blocking(modalTriple("trap-focus")),
      ]
    ).toEqual([true, false])
  })
})
