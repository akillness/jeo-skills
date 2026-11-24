// @vitest-environment jsdom
// Date Picker through a small adapter that renders like a framework does: a
// microtask after a change. The calendar's days render without the popup,
// since the popup itself is Popover's and tested there.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createDatePickerController,
  datePicker,
  type DatePickerOptions,
} from "../src/components/date-picker/date-picker"
import type { CalendarGridState } from "../src/components/calendar/calendar"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import { attrs, bind, partState } from "../src/foundation/kernel/part"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))

function mount(
  options: DatePickerOptions = {},
  { lang, fieldset }: { lang?: string; fieldset?: HTMLFieldSetElement } = {}
) {
  const instance = datePicker({
    id: "d",
    today: "2026-10-16",
    ...options,
  }) as ReturnType<typeof datePicker> & PrimitiveInstance
  const form = document.createElement("form")
  if (lang) {
    form.lang = lang
  }
  ;(fieldset ?? document.body).append(form)
  if (fieldset) {
    document.body.append(fieldset)
  }
  const mounted = new Map<string, { el: HTMLElement; unbind: () => void }>()
  let seen = new Set<string>()

  function el(
    key: string,
    slot: string,
    props: Record<string, unknown>,
    tag: string,
    parent: HTMLElement
  ) {
    seen.add(key)
    const part = instance.part(slot as never, props as never)
    let entry = mounted.get(key)
    if (!entry) {
      const created = document.createElement(tag)
      parent.append(created)
      entry = { el: created, unbind: bind(part, created) }
      mounted.set(key, entry)
    }
    for (const [name, value] of Object.entries(attrs(part, props))) {
      if (name === "value" && entry.el instanceof HTMLInputElement) {
        continue
      } else if (value === undefined) {
        entry.el.removeAttribute(name)
      } else {
        entry.el.setAttribute(name, value)
      }
    }
    return { el: entry.el, part }
  }

  function render() {
    seen = new Set()
    const state = instance.get() as { mode: string; months: number }
    const root = el("root", "root", {}, "div", form).el
    el("input", "input", { id: "start" }, "input", root)
    if (state.mode === "range") {
      el("input:end", "input", { end: true, id: "end" }, "input", root)
    }
    el("hidden", "hidden-input", { id: "start" }, "input", root)
    if (state.mode === "range") {
      el("hidden:end", "hidden-input", { end: true, id: "end" }, "input", root)
    }
    el("trigger", "trigger", {}, "button", root)
    el("clear", "clear", {}, "button", root)
    el(
      "preset",
      "preset",
      {
        value:
          options.mode === "range"
            ? ["2026-10-09", "2026-10-16"]
            : "2026-12-25",
        id: "p",
      },
      "button",
      root
    )
    const hint = el("hint", "hint", {}, "span", root)
    hint.el.textContent = (
      partState(hint.part) as { placeholder: string }
    ).placeholder
    for (let offset = 0; offset < state.months; offset++) {
      const grid = el(
        `grid:${offset}`,
        "grid",
        { offset, id: String(offset) },
        "table",
        root
      )
      const gridState = partState(grid.part) as CalendarGridState
      gridState.weeks.forEach((week, index) => {
        const row = el(
          `week:${offset}:${index}`,
          "week",
          { id: `${offset}-${index}` },
          "tr",
          grid.el
        ).el
        for (const cell of week) {
          if (!cell.hidden) {
            el(
              `day:${offset}:${index}:${cell.date}`,
              "day",
              { value: cell.date, offset },
              "td",
              row
            )
          }
        }
      })
    }
    for (const [key, entry] of mounted) {
      if (!seen.has(key)) {
        entry.unbind()
        entry.el.remove()
        mounted.delete(key)
      }
    }
  }

  let queued = false
  cleanups.push(
    instance.subscribe(() => {
      if (queued) {
        return
      }
      queued = true
      queueMicrotask(() => {
        queued = false
        render()
      })
    })
  )
  render()
  cleanups.push(() => mounted.forEach((entry) => entry.unbind()))

  const get = (key: string) => mounted.get(key)!.el
  const input = (end = false) =>
    get(end ? "input:end" : "input") as HTMLInputElement
  const hidden = (end = false) =>
    get(end ? "hidden:end" : "hidden") as HTMLInputElement
  // Types into an input and commits it, as blur does.
  async function type(text: string, end = false) {
    const target = input(end)
    target.value = text
    target.dispatchEvent(new Event("input", { bubbles: true }))
    target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    await tick()
  }
  const day = (date: string) =>
    form.querySelector<HTMLElement>(
      `[data-value="${date}"]:not([data-outside])`
    )!
  return { instance, form, get, input, hidden, type, day }
}

describe("datePicker", () => {
  test("a typed date in the locale's order becomes the value on blur, and shows in that format", async () => {
    const onValueChange = vi.fn()
    const picker = mount({ onValueChange })
    await picker.type("10/20/2026")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "2026-10-20",
      expect.objectContaining({ reason: "input-commit" })
    )
    expect(picker.input().value).toBe("10/20/2026")
    expect(picker.hidden().value).toBe("2026-10-20")

    await picker.type("Dec 3")
    expect(picker.instance.get().value).toBe("2026-12-03")
    expect(picker.input().value).toBe("12/03/2026")
    // The calendar turns to it.
    expect(picker.instance.get().month).toBe("2026-12")
  })

  test("German reads day first", async () => {
    const picker = mount({}, { lang: "de" })
    await tick()
    await picker.type("3.12.2026")
    expect(picker.instance.get().value).toBe("2026-12-03")
    expect(picker.input().value).toBe("03.12.2026")
    expect(picker.get("hint").textContent).toBe("TT.MM.JJJJ")
  })

  test("text that isn't a pickable date stays as typed and marks the input invalid until it's fixed", async () => {
    const picker = mount({
      defaultValue: "2026-10-16",
      max: "2026-10-31",
      unavailable: ["2026-10-24"],
    })
    for (const text of ["32/45/2026", "11/02/2026", "10/24/2026"]) {
      await picker.type(text)
      expect(picker.input().value).toBe(text)
      expect(picker.input().getAttribute("aria-invalid")).toBe("true")
      expect(picker.get("root").hasAttribute("data-invalid")).toBe(true)
      expect(picker.instance.get().value).toBe("2026-10-16")
    }
    await picker.type("10/23/2026")
    expect(picker.input().hasAttribute("aria-invalid")).toBe(false)
    expect(picker.instance.get().value).toBe("2026-10-23")
  })

  test("a new value from elsewhere replaces text being typed", async () => {
    const controller = createDatePickerController()
    const picker = mount({ controller })
    await picker.type("nope")
    expect(picker.input().getAttribute("aria-invalid")).toBe("true")
    controller.setValue("2026-11-05")
    await tick()
    expect(picker.input().value).toBe("11/05/2026")
    expect(picker.input().hasAttribute("aria-invalid")).toBe(false)
  })

  // A controlled picker whose owner passes a value back with `pass`, as a framework does after it renders.
  function controlled(onValueChange?: (value: string) => void) {
    const controller = createDatePickerController()
    const options: DatePickerOptions = {
      today: "2026-10-16",
      controller,
      value: "2026-11-14",
      onValueChange: (value) => onValueChange?.(value as string),
    }
    const picker = mount(options)
    const pass = (value: string) =>
      picker.instance.setOptions({ id: "d", ...options, value })
    return { controller, pass, month: () => picker.instance.get().month }
  }

  test("a value set from code turns the calendar to it", () => {
    const controller = createDatePickerController()
    const picker = mount({ controller, defaultValue: "2026-11-14" })
    expect(controller.setValue("2026-12-25")).toBe(true)
    expect(picker.instance.get().month).toBe("2026-12")
  })

  test("a controlled value set from code turns the calendar once its owner passes it back", () => {
    const { controller, pass, month } = controlled()
    expect(controller.setValue("2026-12-25")).toBe(true)
    pass("2026-12-25")
    expect(month()).toBe("2026-12")
  })

  test("a controlled value its owner turns down or replaces takes the calendar with it", () => {
    const kept = controlled()
    kept.controller.setValue("2026-12-25")
    kept.pass("2026-11-14")
    expect(kept.month()).toBe("2026-11")
    const replaced = controlled()
    replaced.controller.setValue("2026-12-25")
    replaced.pass("2027-03-01")
    expect(replaced.month()).toBe("2027-03")
  })

  test("a value onValueChange replaced turns the calendar to what it kept", () => {
    const controller = createDatePickerController()
    const picker = mount({
      controller,
      defaultValue: "2026-11-14",
      onValueChange(value) {
        if (value === "2026-12-25") {
          controller.setValue("2027-01-05")
        }
      },
    })
    controller.setValue("2026-12-25")
    expect(picker.instance.get().value).toBe("2027-01-05")
    expect(picker.instance.get().month).toBe("2027-01")
  })

  test("a value onValueChange put back leaves the calendar on it", () => {
    const controller = createDatePickerController()
    const picker = mount({
      controller,
      defaultValue: "2026-11-14",
      onValueChange(value) {
        if (value === "2026-12-25") {
          controller.setValue("2026-11-14")
        }
      },
    })
    controller.setValue("2026-12-25")
    expect(picker.instance.get().value).toBe("2026-11-14")
    expect(picker.instance.get().month).toBe("2026-11")
  })

  test("a value onValueChange echoes still turns the calendar to it", () => {
    const controller = createDatePickerController()
    let echoed = false
    const picker = mount({
      controller,
      defaultValue: "2026-11-14",
      onValueChange(value) {
        if (!echoed) {
          echoed = true
          controller.setValue(value as string)
        }
      },
    })
    controller.setValue("2026-12-25")
    expect(picker.instance.get().month).toBe("2026-12")
  })

  test("the calendar follows the value a binding writes, whatever onValueChange asked for", () => {
    const bound = controlled((value) => {
      if (value === "2026-12-25") {
        bound.controller.setValue("2026-11-14")
      }
    })
    bound.controller.setValue("2026-12-25")
    bound.pass("2026-12-25")
    expect(bound.month()).toBe("2026-12")
    const redirected = controlled((value) => {
      if (value === "2026-12-26") {
        redirected.controller.setValue("2027-01-04")
      }
    })
    redirected.controller.setValue("2026-12-26")
    redirected.pass("2026-12-26")
    expect(redirected.month()).toBe("2026-12")
  })

  test("clearing the text clears the value", async () => {
    const picker = mount({ defaultValue: "2026-10-16" })
    await picker.type("")
    expect(picker.instance.get().value).toBe(null)
    expect(picker.hidden().value).toBe("")
  })

  test("picking a day sets the value and closes the popup, unless closeOnSelect is false", async () => {
    const onOpenChange = vi.fn()
    const picker = mount({ defaultOpen: true, onOpenChange })
    picker.day("2026-10-20").click()
    await tick()
    expect(picker.instance.get().value).toBe("2026-10-20")
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "item-press" })
    )
    expect(picker.input().value).toBe("10/20/2026")

    const open = mount({ defaultOpen: true, closeOnSelect: false })
    open.day("2026-10-20").click()
    await tick()
    expect(open.instance.get().open).toBe(true)
  })

  test("the trigger opens and closes the popup, and names the date chosen", async () => {
    const picker = mount({ defaultValue: "2026-10-16" })
    const trigger = picker.get("trigger")
    expect(trigger.getAttribute("aria-label")).toBe(
      "Choose date, Friday, October 16, 2026"
    )
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
    trigger.click()
    await tick()
    expect(picker.instance.get().open).toBe(true)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    trigger.click()
    await tick()
    expect(picker.instance.get().open).toBe(false)
  })

  test("Alt+ArrowDown in the input opens the popup, and Enter commits", async () => {
    const picker = mount()
    const input = picker.input()
    input.value = "10/18/2026"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    )
    await tick()
    expect(picker.instance.get().value).toBe("2026-10-18")
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    await tick()
    expect(picker.instance.get().open).toBe(true)
  })

  test("a range takes each end from its own input, and waits for both", async () => {
    const onValueChange = vi.fn()
    const picker = mount({
      mode: "range",
      startName: "checkin",
      endName: "checkout",
      onValueChange,
    })
    await picker.type("10/20/2026")
    expect(picker.instance.get().value).toBe(null)
    expect(picker.input().value).toBe("10/20/2026")
    // The calendar waits for the end too.
    expect(picker.day("2026-10-20").hasAttribute("data-range-start")).toBe(true)
    await picker.type("10/23/2026", true)
    expect(picker.instance.get().value).toEqual(["2026-10-20", "2026-10-23"])
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect([picker.hidden().name, picker.hidden().value]).toEqual([
      "checkin",
      "2026-10-20",
    ])
    expect([picker.hidden(true).name, picker.hidden(true).value]).toEqual([
      "checkout",
      "2026-10-23",
    ])
    expect(new FormData(picker.form).get("checkout")).toBe("2026-10-23")
  })

  test("a range end before its start, or one that breaks the range rules, is invalid", async () => {
    const picker = mount({
      mode: "range",
      defaultValue: ["2026-10-20", "2026-10-23"],
      maxDays: 5,
    })
    await picker.type("10/10/2026", true)
    expect(picker.input(true).getAttribute("aria-invalid")).toBe("true")
    await picker.type("10/30/2026", true)
    expect(picker.input(true).getAttribute("aria-invalid")).toBe("true")
    expect(picker.instance.get().value).toEqual(["2026-10-20", "2026-10-23"])
    await picker.type("10/22/2026", true)
    expect(picker.instance.get().value).toEqual(["2026-10-20", "2026-10-22"])
  })

  test("picking a range in the calendar shows its start in the start input while the end is picked", async () => {
    const picker = mount({ mode: "range", defaultOpen: true })
    picker.day("2026-10-12").click()
    await tick()
    expect(picker.input().value).toBe("10/12/2026")
    expect(picker.input(true).value).toBe("")
    expect(picker.instance.get().open).toBe(true)
    picker.day("2026-10-14").click()
    await tick()
    expect(picker.instance.get().value).toEqual(["2026-10-12", "2026-10-14"])
    expect(picker.input(true).value).toBe("10/14/2026")
    expect(picker.instance.get().open).toBe(false)
  })

  test("presets select their value and Clear clears it", async () => {
    const onValueChange = vi.fn()
    const picker = mount({ defaultOpen: true, onValueChange })
    const preset = picker.get("preset")
    preset.click()
    await tick()
    expect(onValueChange).toHaveBeenLastCalledWith(
      "2026-12-25",
      expect.objectContaining({ reason: "preset-press" })
    )
    expect(preset.getAttribute("aria-pressed")).toBe("true")
    expect(picker.instance.get().month).toBe("2026-12")
    expect(picker.instance.get().open).toBe(false)
    picker.get("clear").click()
    await tick()
    expect(onValueChange).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ reason: "clear-press" })
    )
    expect(picker.get("clear").hasAttribute("data-empty")).toBe(true)
  })

  test("a preset with a date people can't pick is disabled and selects nothing", async () => {
    const onValueChange = vi.fn()
    for (const options of [
      { max: "2026-11-30" },
      { unavailable: ["2026-12-25"] },
    ]) {
      const picker = mount({ defaultOpen: true, onValueChange, ...options })
      await tick()
      const preset = picker.get("preset")
      expect(preset.hasAttribute("disabled")).toBe(true)
      preset.click()
      await tick()
      expect(picker.instance.get().value).toBe(null)
      expect(picker.instance.get().open).toBe(true)
      document.body.replaceChildren()
    }
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("a range preset the range rules don't allow is disabled and selects nothing", async () => {
    const picker = mount({ mode: "range", defaultOpen: true, maxDays: 7 })
    await tick()
    expect(picker.get("preset").hasAttribute("disabled")).toBe(true)
    picker.get("preset").click()
    await tick()
    expect(picker.instance.get().value).toBe(null)
  })

  test("a controller can't set a date people can't pick", () => {
    const controller = createDatePickerController()
    const picker = mount({
      controller,
      max: "2026-11-30",
      unavailable: ["2026-10-24"],
    })
    expect(controller.setValue("2026-12-25")).toBe(false)
    expect(controller.setValue("2026-10-24")).toBe(false)
    expect(picker.instance.get().value).toBe(null)
    expect(controller.setValue("2026-10-23")).toBe(true)
    const range = createDatePickerController()
    mount({ controller: range, mode: "range", minDays: 3 })
    expect(range.setValue(["2026-10-20", "2026-10-21"])).toBe(false)
    expect(range.setValue(["2026-10-20", "2026-10-22"])).toBe(true)
  })

  test("a controller can't set text that isn't a date, and the value stays", () => {
    const changes: unknown[] = []
    const controller = createDatePickerController()
    const picker = mount({
      controller,
      defaultValue: "2026-10-16",
      onValueChange: (value) => changes.push(value),
    })
    for (const text of ["25/12/2026", "2026-02-30", "tomorrow"]) {
      expect(controller.setValue(text as never)).toBe(false)
    }
    expect([picker.instance.get().value, changes]).toEqual(["2026-10-16", []])
    expect(controller.setValue(null)).toBe(true)

    const range = createDatePickerController()
    const ranged = mount({
      controller: range,
      mode: "range",
      defaultValue: ["2026-10-20", "2026-10-22"],
    })
    expect(range.setValue(["2026-10-21"] as never)).toBe(false)
    expect(ranged.instance.get().value).toEqual(["2026-10-20", "2026-10-22"])
  })

  test("a controller can't change a disabled or read-only picker, but the browser's restore can", () => {
    for (const locked of [{ disabled: true }, { readOnly: true }]) {
      const controller = createDatePickerController()
      const picker = mount({
        controller,
        defaultValue: "2026-10-16",
        ...locked,
      })
      expect(controller.setValue("2026-10-20")).toBe(false)
      expect(picker.instance.get().value).toBe("2026-10-16")
      picker.instance.api.internal.restore(JSON.stringify("2026-10-21"))
      expect(picker.instance.get().value).toBe("2026-10-21")
    }
  })

  test("a form reset puts the default value back", async () => {
    const picker = mount({ defaultValue: "2026-10-16" })
    await picker.type("11/01/2026")
    picker.form.reset()
    await tick()
    expect(picker.instance.get().value).toBe("2026-10-16")
    expect(picker.input().value).toBe("10/16/2026")
  })

  test("a disabled fieldset disables it", async () => {
    const fieldset = document.createElement("fieldset")
    const picker = mount({}, { fieldset })
    await tick()
    fieldset.disabled = true
    await tick()
    expect(picker.input().disabled).toBe(true)
    expect(picker.get("trigger").hasAttribute("disabled")).toBe(true)
    expect(picker.day("2026-10-16").hasAttribute("tabindex")).toBe(false)
  })
})

test("a field a framework rendered before its root read the page's language keeps its date", () => {
  const instance = datePicker({ id: "due", defaultValue: "2026-10-16" })
  const root = document.body.appendChild(document.createElement("div"))
  root.lang = "de"
  const input = root.appendChild(document.createElement("input"))
  input.value = String(attrs(instance.part("input", {}), {}).value)
  expect(input.value).toBe("10/16/2026")
  cleanups.push(
    bind(instance.part("root"), root),
    bind(instance.part("input", {}), input),
    () => instance.destroy()
  )
  expect(input.value).toBe("16.10.2026")
  expect(input.hasAttribute("aria-invalid")).toBe(false)
  expect(instance.get().value).toBe("2026-10-16")
})
