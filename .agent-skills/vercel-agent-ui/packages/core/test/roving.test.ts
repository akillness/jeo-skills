import { describe, expect, test } from "vitest"
import { fieldKeepsKey, rovingStop } from "../src/foundation/focus/collection"
import { menu } from "../src/components/menu/menu"
import { menubar } from "../src/components/menubar/menubar"
import { toolbar } from "../src/components/toolbar/toolbar"
import { attrs } from "../src/foundation/kernel/part"

const item = (
  key: string,
  extra: { disabled?: boolean; focusable?: boolean; preferred?: boolean } = {}
) => ({
  key,
  disabled: false,
  focusable: true,
  preferred: false,
  ...extra,
})

describe("the tab stop", () => {
  test("a remembered item keeps it while it can take focus", () => {
    expect(rovingStop([item("a"), item("b")], "b")).toBe("b")
    expect(rovingStop([item("a"), item("b", { focusable: false })], "b")).toBe(
      "a"
    )
    expect(rovingStop([item("a")], "gone")).toBe("a")
  })

  test("otherwise the first preferred enabled item, then the first enabled one", () => {
    expect(rovingStop([item("a"), item("b", { preferred: true })])).toBe("b")
    expect(
      rovingStop([item("a"), item("b", { preferred: true, disabled: true })])
    ).toBe("a")
    expect(rovingStop([item("a", { disabled: true }), item("b")])).toBe("b")
  })

  test("a group where every item is disabled keeps a focusable one, unless none can take focus", () => {
    expect(
      rovingStop([item("a", { disabled: true }), item("b", { disabled: true })])
    ).toBe("a")
    expect(
      rovingStop([item("a", { disabled: true, focusable: false })])
    ).toBeNull()
  })
})

describe("text fields in a roving group", () => {
  const field = (start: number, end = start, length = 5, rtl = false) => ({
    start,
    end,
    length,
    rtl,
    usesUpDown: false,
  })

  test("Left and Right leave only from the end they point at, with nothing selected", () => {
    expect(fieldKeepsKey("ArrowRight", field(5))).toBe(false)
    expect(fieldKeepsKey("ArrowRight", field(2))).toBe(true)
    expect(fieldKeepsKey("ArrowLeft", field(0))).toBe(false)
    expect(fieldKeepsKey("ArrowLeft", field(0, 3))).toBe(true)
  })

  test("right to left, the arrows swap", () => {
    expect(fieldKeepsKey("ArrowLeft", field(5, 5, 5, true))).toBe(false)
    expect(fieldKeepsKey("ArrowRight", field(0, 0, 5, true))).toBe(false)
    expect(fieldKeepsKey("ArrowRight", field(5, 5, 5, true))).toBe(true)
  })

  test("Home and End stay with the field, and Up and Down only with fields that use them", () => {
    expect(fieldKeepsKey("Home", field(0))).toBe(true)
    expect(fieldKeepsKey("End", field(5))).toBe(true)
    expect(fieldKeepsKey("ArrowUp", field(0))).toBe(false)
    expect(fieldKeepsKey("ArrowUp", { ...field(0), usesUpDown: true })).toBe(
      true
    )
  })

  test("fields without a caret never keep arrows", () => {
    expect(
      fieldKeepsKey("ArrowRight", {
        start: null,
        end: null,
        length: 0,
        rtl: false,
        usesUpDown: false,
      })
    ).toBe(false)
  })
})

describe("servers render one tab stop", () => {
  test("the first enabled toolbar item claims it, whatever the part", () => {
    const bar = toolbar({ id: "t" })
    const stop = (slot: "button" | "link" | "input", props: object) =>
      attrs(bar.part(slot, props)).tabindex
    expect(stop("button", { id: "a", disabled: true })).toBe("-1")
    expect(stop("link", { id: "b" })).toBe("0")
    expect(stop("input", { id: "c" })).toBe("-1")
    // Rendering again keeps the same claim.
    expect(stop("link", { id: "b" })).toBe("0")
  })

  test("a disabled item that can't take focus is disabled as a button and a link, and never claims it", () => {
    const bar = toolbar({ id: "t" })
    expect(
      attrs(
        bar.part("button", {
          id: "a",
          disabled: true,
          focusableWhenDisabled: false,
        })
      )
    ).toMatchObject({
      disabled: "",
      "aria-disabled": "true",
      tabindex: undefined,
    })
  })

  test("a menubar's first enabled trigger claims it", () => {
    const bar = menubar({ id: "m" })
    const trigger = (id: string, disabled = false) =>
      attrs(
        menu({ id, menubar: () => bar.api }).part("trigger", {
          id: `${id}-t`,
          disabled,
        })
      )
    expect(trigger("a", true)).toMatchObject({
      role: "menuitem",
      tabindex: "-1",
      "aria-disabled": "true",
    })
    expect(trigger("b")).toMatchObject({ tabindex: "0" })
    expect(trigger("c")).toMatchObject({ tabindex: "-1" })
  })
})
