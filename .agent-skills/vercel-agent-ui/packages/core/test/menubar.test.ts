import { describe, expect, test } from "vitest"
import { menu } from "../src/components/menu/menu"
import {
  createMenubarController,
  menubar,
} from "../src/components/menubar/menubar"
import { attrs } from "../src/foundation/kernel/part"
import { kept } from "./kept"

const trigger = (
  bar: ReturnType<typeof menubar>,
  id: string,
  disabled = false
) =>
  attrs(
    menu({ id, menubar: () => bar.api }).part("trigger", {
      id: `${id}-t`,
      disabled,
    })
  )

describe("menubar", () => {
  test("the root is a horizontal menubar by default", () => {
    expect(attrs(menubar({ id: "m" }).part("root"))).toMatchObject({
      role: "menubar",
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal",
      "data-disabled": undefined,
      "data-open": undefined,
    })
    expect(
      attrs(
        menubar({ id: "m", orientation: "vertical", disabled: true }).part(
          "root"
        )
      )
    ).toMatchObject({
      "aria-orientation": "vertical",
      "data-disabled": "",
    })
  })

  test("a disabled menubar still renders one tab stop, on its first trigger", () => {
    const bar = menubar({ id: "m", disabled: true })
    expect(trigger(bar, "a")).toMatchObject({
      tabindex: "0",
      "aria-disabled": "true",
      "data-disabled": "",
    })
    expect(trigger(bar, "b")).toMatchObject({
      tabindex: "-1",
      "aria-disabled": "true",
    })
  })

  test("it tracks the open menu, and a stale close leaves another menu open", () => {
    const controller = createMenubarController()
    const bar = kept(menubar({ id: "m", controller }))
    bar.api.internal.openChanged("file", true)
    expect(controller.isOpen()).toBe(true)
    expect(attrs(bar.part("root"))["data-open"]).toBe("")
    bar.api.internal.openChanged("edit", true)
    bar.api.internal.openChanged("file", false)
    expect(controller.isOpen()).toBe(true)
    bar.api.internal.openChanged("edit", false)
    expect(controller.isOpen()).toBe(false)
    expect(attrs(bar.part("root"))["data-open"]).toBeUndefined()
  })

  test("in a vertical menubar, the arrow back toward it closes the menu and the other does nothing", () => {
    const bar = menubar({ id: "m", orientation: "vertical" })
    const event = new Event("keydown")
    expect(bar.api.internal.menuArrow("file", -1, event)).toBe("close")
    expect(bar.api.internal.menuArrow("file", 1, event)).toBeUndefined()
  })
})
