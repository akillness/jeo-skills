import { describe, expect, test } from "vitest"
import {
  isModified,
  listKey,
  motionOf,
  opensElsewhere,
  panelKey,
  stepIndex,
} from "../src/components/navigation-menu/navigation-menu-keyboard"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { isShown } from "../src/components/navigation-menu/navigation-menu-api"
import { attrs, present } from "../src/foundation/kernel/part"

describe("keys", () => {
  test("a horizontal menu moves with left and right, mirrored right to left, and enters with down", () => {
    expect(listKey("ArrowRight", "horizontal", false)).toBe(1)
    expect(listKey("ArrowLeft", "horizontal", false)).toBe(-1)
    expect(listKey("ArrowLeft", "horizontal", true)).toBe(1)
    expect(listKey("ArrowDown", "horizontal", false)).toBe("enter")
    expect(listKey("ArrowUp", "horizontal", false)).toBeUndefined()
  })

  test("a vertical menu moves with up and down, and enters toward the inline end", () => {
    expect(listKey("ArrowDown", "vertical", false)).toBe(1)
    expect(listKey("ArrowUp", "vertical", true)).toBe(-1)
    expect(listKey("ArrowRight", "vertical", false)).toBe("enter")
    expect(listKey("ArrowLeft", "vertical", true)).toBe("enter")
    expect(listKey("ArrowLeft", "vertical", false)).toBeUndefined()
  })

  test("Home and End go to the ends of the list and of a panel", () => {
    expect(listKey("Home", "horizontal", false)).toBe("first")
    expect(listKey("End", "vertical", false)).toBe("last")
    expect(panelKey("Home", false)).toBe("first")
    expect(panelKey("End", true)).toBe("last")
  })

  test("in a panel, down and the inline end go forward, mirrored right to left", () => {
    expect(panelKey("ArrowDown", false)).toBe(1)
    expect(panelKey("ArrowRight", false)).toBe(1)
    expect(panelKey("ArrowLeft", true)).toBe(1)
    expect(panelKey("ArrowUp", false)).toBe(-1)
    expect(panelKey("Tab", false)).toBeUndefined()
  })

  test("keys with a modifier are left to the browser, like Alt+Left for Back", () => {
    const keys = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }
    expect(isModified(keys)).toBe(false)
    expect(isModified({ ...keys, altKey: true })).toBe(true)
    expect(isModified({ ...keys, ctrlKey: true })).toBe(true)
    expect(isModified({ ...keys, metaKey: true })).toBe(true)
    expect(isModified({ ...keys, shiftKey: true })).toBe(true)
  })

  test("steps stop at the ends instead of wrapping", () => {
    expect(stepIndex(2, 1, 3)).toBe(2)
    expect(stepIndex(0, -1, 3)).toBe(0)
    expect(stepIndex(1, "last", 3)).toBe(2)
    expect(stepIndex(1, "first", 3)).toBe(0)
  })
})

describe("motion", () => {
  test("moving to a later item enters from the end and leaves toward the start", () => {
    const state = { value: "b", previous: "a", forward: true }
    expect(motionOf("b", state)).toBe("from-end")
    expect(motionOf("a", state)).toBe("to-start")
    expect(motionOf("c", state)).toBeUndefined()
  })

  test("moving to an earlier item enters from the start and leaves toward the end", () => {
    const state = { value: "a", previous: "b", forward: false }
    expect(motionOf("a", state)).toBe("from-start")
    expect(motionOf("b", state)).toBe("to-end")
  })

  test("opening from closed has no motion", () => {
    expect(
      motionOf("a", { value: "a", previous: null, forward: null })
    ).toBeUndefined()
  })
})

describe("links", () => {
  test("a press with a modifier key or the middle button opens elsewhere", () => {
    const press = (init: {
      metaKey?: boolean
      ctrlKey?: boolean
      button?: number
    }) =>
      ({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...init,
      }) as unknown as Event
    expect(opensElsewhere(press({}))).toBe(false)
    expect(opensElsewhere(press({ metaKey: true }))).toBe(true)
    expect(opensElsewhere(press({ ctrlKey: true }))).toBe(true)
    expect(opensElsewhere(press({ button: 1 }))).toBe(true)
  })
})

describe("state", () => {
  const base = {
    value: null,
    orientation: "horizontal" as const,
    mounted: false,
    active: null,
    previous: null,
    forward: null,
    exiting: [],
    contents: [],
    viewport: true,
    nested: false,
  }

  test("with a viewport, the last open content stays shown while the viewport animates out", () => {
    expect(isShown({ ...base, mounted: true, active: "a" }, "a")).toBe(true)
    expect(isShown({ ...base, mounted: false, active: "a" }, "a")).toBe(false)
  })

  test("with a viewport, a content that gave way stays shown while it animates out", () => {
    expect(
      isShown(
        { ...base, mounted: true, value: "b", active: "b", exiting: ["a"] },
        "a"
      )
    ).toBe(true)
  })

  test("without a viewport, a content is shown while open or in the page", () => {
    expect(isShown({ ...base, viewport: false, value: "a" }, "a")).toBe(true)
    expect(isShown({ ...base, viewport: false, contents: ["a"] }, "a")).toBe(
      true
    )
    expect(isShown({ ...base, viewport: false }, "a")).toBe(false)
  })

  test("a menu open from the start renders its item open, with its trigger expanded", () => {
    const menu = navigationMenu({ id: "nav", defaultValue: "products" })
    expect(
      attrs(menu.part("trigger", { value: "products" }))["aria-expanded"]
    ).toBe("true")
    expect(
      attrs(menu.part("trigger", { value: "resources" }))["aria-expanded"]
    ).toBe("false")
    expect(present(menu.part("content", { value: "products" }))).toBe(true)
    expect(present(menu.part("content", { value: "resources" }))).toBe(false)
    expect(
      present(menu.part("content", { value: "resources", keepMounted: true }))
    ).toBe(true)
    expect(
      attrs(
        menu.part("content", { value: "resources", hiddenUntilFound: true })
      ).hidden
    ).toBe("until-found")
  })

  test("the controller opens, switches and closes items, with reasons", () => {
    const changes: string[] = []
    const menu = navigationMenu({
      id: "nav",
      onValueChange: (value, { reason }) => changes.push(`${value}: ${reason}`),
    })
    menu.api.setValue("products")
    menu.api.setValue("resources")
    menu.api.close()
    expect(changes).toEqual([
      "products: imperative",
      "resources: imperative",
      "null: imperative",
    ])
    expect(menu.api.isOpen()).toBe(false)
  })

  test("a canceled change leaves the menu as it was", () => {
    const menu = navigationMenu({
      id: "nav",
      onValueChange: (_, details) => details.cancel(),
    })
    expect(menu.api.setValue("products")).toBe(false)
    expect(menu.api.getValue()).toBe(null)
  })

  test("the current page's link says so", () => {
    const menu = navigationMenu({ id: "nav" })
    expect(
      attrs(menu.part("link", { id: "a", current: true }))["aria-current"]
    ).toBe("page")
    expect(
      attrs(menu.part("link", { id: "b" }))["aria-current"]
    ).toBeUndefined()
  })
})
