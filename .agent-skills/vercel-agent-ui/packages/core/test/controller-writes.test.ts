import { describe, expect, test } from "vitest"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { command } from "../src/components/command/command"
import { datePicker } from "../src/components/date-picker/date-picker"
import { alertDialog } from "../src/components/dialog/alert-dialog"
import { dialog } from "../src/components/dialog/dialog"
import { drawer } from "../src/components/drawer/drawer"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { input } from "../src/components/input/input"
import { listbox } from "../src/components/listbox/listbox-root"
import { menu } from "../src/components/menu/menu"
import { otpInput } from "../src/components/otp-input/otp-input"
import { popover } from "../src/components/popover/popover"
import { select } from "../src/components/select/select"
import { tokenInput } from "../src/components/token-input/token-input"
import { tooltip } from "../src/components/tooltip/tooltip"

type Popup = {
  api: {
    setOpen: (open: boolean) => boolean
    close: () => boolean
    toggle: () => boolean
  }
}

const popups = {
  autocomplete,
  combobox,
  datePicker,
  alertDialog,
  dialog,
  drawer,
  hoverCard,
  menu,
  popover,
  select,
  tooltip,
}

describe.each(Object.entries(popups))("%s", (name, primitive) => {
  const create = primitive as unknown as (options: object) => Popup

  test("setOpen, close and toggle say whether it opened or closed", () => {
    const { api } = create({ id: name })
    expect(api.setOpen(true)).toBe(true)
    expect(api.setOpen(true)).toBe(false)
    expect(api.close()).toBe(true)
    expect(api.close()).toBe(false)
    expect(api.toggle()).toBe(true)
    expect(api.toggle()).toBe(true)
  })

  test("a canceled change returns false", () => {
    const { api } = create({
      id: name,
      onOpenChange: (_: boolean, details: { cancel: () => void }) =>
        details.cancel(),
    })
    expect(api.setOpen(true)).toBe(false)
    expect(api.toggle()).toBe(false)
  })

  test("a controlled change it asked for returns true", () => {
    const { api } = create({ id: name, open: false })
    expect(api.setOpen(true)).toBe(true)
  })
})

describe("value writes say whether the value changed", () => {
  test("select", () => {
    const { api } = select({ id: "s" })
    expect(api.setValue("a")).toBe(true)
    expect(api.setValue("a")).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
    expect(api.setQuery("x")).toBe(true)
    expect(api.setQuery("x")).toBe(false)
    expect(select({ id: "r", readOnly: true }).api.setValue("a")).toBe(false)
  })

  test("combobox", () => {
    const { api } = combobox({ id: "c" })
    expect(api.setValue("a")).toBe(true)
    expect(api.setValue("a")).toBe(false)
    expect(api.setQuery("x")).toBe(true)
    expect(api.setQuery("x")).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
  })

  test("autocomplete", () => {
    const { api } = autocomplete({ id: "a" })
    expect(api.setValue("a")).toBe(true)
    expect(api.setValue("a")).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
  })

  test("listbox", () => {
    const { api } = listbox({ id: "l" })
    expect(api.setValue("a")).toBe(true)
    expect(api.setValue("a")).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
    expect(api.selectAll()).toBe(false)
  })

  test("input", () => {
    const { api } = input({ id: "i" })
    expect(api.setValue("a")).toBe(true)
    expect(api.setValue("a")).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
  })

  test("otp input", () => {
    const { api } = otpInput({ id: "o" })
    expect(api.setValue("12")).toBe(true)
    expect(api.setValue("12")).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
  })

  test("token input", () => {
    const { api } = tokenInput({ id: "t" })
    expect(api.setValue(["hi"])).toBe(true)
    expect(api.setValue(["hi"])).toBe(false)
    expect(api.clear()).toBe(true)
    expect(api.clear()).toBe(false)
  })

  test("command", () => {
    const { api } = command({ id: "k" })
    expect(api.setQuery("x")).toBe(true)
    expect(api.setQuery("x")).toBe(false)
    expect(api.push("settings")).toBe(true)
    expect(api.pop()).toBe(true)
    expect(api.pop()).toBe(false)
    expect(api.setPages(["a"])).toBe(true)
    expect(api.setPages(["a"])).toBe(false)
  })

  test("drawer snap point", () => {
    const { api } = drawer({ id: "d", snapPoints: [0.5, 1] })
    expect(api.setSnapPoint(1)).toBe(true)
    expect(api.setSnapPoint(1)).toBe(false)
  })
})

describe("controller verbs", () => {
  test("date picker clears its value", () => {
    const { api } = datePicker({ id: "p", defaultValue: "2026-10-16" })
    expect(api.clear()).toBe(true)
    expect(api.getValue()).toBe(null)
    expect(api.clear()).toBe(false)
  })
})
