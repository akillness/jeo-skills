import { describe, expect, test } from "vitest"
import { carousel } from "../src/components/carousel/carousel"
import { orientationOf } from "../src/foundation/focus/collection"
import { listbox } from "../src/components/listbox/listbox-root"
import { menubar } from "../src/components/menubar/menubar"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { numberInput } from "../src/components/number-input/number-input"
import { resizable } from "../src/components/resizable/resizable"
import { scrollArea } from "../src/components/scroll-area/scroll-area"
import { slider } from "../src/components/slider/slider"
import { tabs } from "../src/components/tabs/tabs"
import { toggleGroup } from "../src/components/toggle/toggle-group"
import { attrs } from "../src/foundation/kernel/part"

// Custom elements pass `orientation` as written, so a typo must fall back to
// the default rather than reach `aria-orientation`.
const typo = "Vertical" as "vertical"

describe("orientation", () => {
  test("anything but the two values is the default", () => {
    expect(orientationOf("vertical", "horizontal")).toBe("vertical")
    expect(orientationOf("horizontal", "vertical")).toBe("horizontal")
    expect(orientationOf("Vertical", "horizontal")).toBe("horizontal")
    expect(orientationOf(undefined, "vertical")).toBe("vertical")
  })

  test("a typo renders the default orientation in every component", () => {
    expect(
      attrs(carousel({ id: "c", orientation: typo }).part("root"))[
        "data-orientation"
      ]
    ).toBe("horizontal")
    expect(
      attrs(menubar({ id: "m", orientation: typo }).part("root"))
    ).toMatchObject({
      "aria-orientation": "horizontal",
      "data-orientation": "horizontal",
    })
    expect(
      attrs(
        listbox({ id: "l", orientation: "Horizontal" as "horizontal" }).part(
          "root"
        )
      )
    ).toMatchObject({
      "aria-orientation": "vertical",
      "data-orientation": "vertical",
    })
    expect(
      attrs(navigationMenu({ id: "n", orientation: typo }).part("root"))[
        "data-orientation"
      ]
    ).toBe("horizontal")
    expect(
      attrs(
        resizable({ id: "r", orientation: typo }).part("handle", { id: "h" })
      )
    ).toMatchObject({
      "aria-orientation": "vertical",
      "data-orientation": "horizontal",
    })
    expect(
      attrs(
        scrollArea({ id: "s" }).part("scrollbar", {
          orientation: "Horizontal" as "horizontal",
        })
      )["data-orientation"]
    ).toBe("vertical")
    expect(
      attrs(numberInput({ id: "i" }).part("scrub-area", { orientation: typo }))[
        "data-orientation"
      ]
    ).toBe("horizontal")
    expect(
      attrs(tabs({ id: "t", orientation: typo }).part("list"))
    ).toMatchObject({
      "data-orientation": "horizontal",
    })
    expect(
      attrs(tabs({ id: "t", orientation: typo }).part("list"))[
        "aria-orientation"
      ]
    ).toBeUndefined()
    expect(
      attrs(slider({ id: "sl", orientation: typo }).part("root"))[
        "data-orientation"
      ]
    ).toBe("horizontal")
    expect(
      attrs(toggleGroup({ id: "g", orientation: typo }).part("group"))[
        "data-orientation"
      ]
    ).toBe("horizontal")
  })
})
