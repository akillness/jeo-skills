import { describe, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { dialog, alertDialog } from "../src/components/dialog/dialog"
import { menu } from "../src/components/menu/menu"
import { popover } from "../src/components/popover/popover"
import { attrs, present } from "../src/foundation/kernel/part"

// How a popup presents, decided at open: `"sheet"` always, `"auto"` only on a
// small touch screen, which a test without a browser never is.
describe("presentation", () => {
  test("is the default unless set, and the content says which", () => {
    const instance = popover({ id: "p", defaultOpen: true })
    expect(attrs(instance.part("content"))["data-presentation"]).toBe("popover")
    expect(present(instance.part("viewport"))).toBe(false)
  })

  test('"sheet" presents as a sheet from the start, in a viewport', () => {
    const instance = popover({
      id: "p",
      defaultOpen: true,
      presentation: "sheet",
    })
    expect(attrs(instance.part("content"))["data-presentation"]).toBe("sheet")
    expect(present(instance.part("viewport"))).toBe(true)
  })

  test('"auto" stays the default without a small touch screen', () => {
    const instance = dialog({ id: "d", presentation: "auto" })
    instance.api.open()
    expect(attrs(instance.part("content"))["data-presentation"]).toBe("dialog")
  })

  test("is decided again at each open", () => {
    const instance = popover({ id: "p" })
    instance.api.open()
    expect(attrs(instance.part("content"))["data-presentation"]).toBe("popover")
    instance.api.close()
    instance.setOptions({ id: "p", presentation: "sheet" })
    instance.api.open()
    expect(attrs(instance.part("content"))["data-presentation"]).toBe("sheet")
  })

  test("an alert dialog has none", () => {
    expect(
      attrs(alertDialog({ id: "a", defaultOpen: true }).part("content"))[
        "data-presentation"
      ]
    ).toBeUndefined()
  })

  test("a submenu presents like its root, without a viewport of its own", () => {
    const root = menu({ id: "m", presentation: "sheet" })
    const sub = menu({ id: "s", parent: root.api })
    root.api.open()
    sub.api.open()
    expect(attrs(sub.part("content"))["data-presentation"]).toBe("sheet")
    expect(present(sub.part("viewport"))).toBe(false)
    expect(present(root.part("viewport"))).toBe(true)
  })

  test("a combobox's input header shows only while its sheet is open", () => {
    const instance = combobox({ id: "c", presentation: "sheet" })
    expect(present(instance.part("header"))).toBe(false)
    instance.api.open()
    expect(present(instance.part("header"))).toBe(true)
  })
})
