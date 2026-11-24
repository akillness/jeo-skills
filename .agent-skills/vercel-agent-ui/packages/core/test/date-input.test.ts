// @vitest-environment jsdom
// Date Input and Time Input through a small adapter that renders like a
// framework does: a microtask after a change, a part for each segment.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  dateInput,
  type DateInputOptions,
} from "../src/components/date-input/date-input"
import {
  timeInput,
  type TimeInputOptions,
} from "../src/components/date-input/time-input"
import {
  compareTo,
  emptyFields,
  fieldsOf,
  layoutOf,
  normalizeValue,
  stepField,
  typeDigit,
  valueOf,
} from "../src/components/date-input/date-input-model"
import type { DateInputState } from "../src/components/date-input/date-input-parts"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import { attrs, bind, partState } from "../src/foundation/kernel/part"
import { bindSegmentSubmit } from "../src/foundation/forms/form"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))

const order = (
  locale: string,
  kind: "date" | "time",
  granularity: "day" | "minute" | "second",
  hourCycle: 12 | 24
) =>
  layoutOf({ kind, granularity, hourCycle, locale })
    .map((item) => (item.type === "literal" ? item.text : item.type))
    .join(" ")
    .replace(/\s/g, " ")

describe("segments", () => {
  test("follow the locale's order, separators and clock", () => {
    expect(order("en-US", "date", "day", 12)).toBe("month / day / year")
    expect(order("de-DE", "date", "day", 24)).toBe("day . month . year")
    expect(order("ja-JP", "date", "day", 24)).toBe("year / month / day")
    expect(order("en-US", "date", "minute", 12)).toBe(
      "month / day / year ,  hour : minute   dayPeriod"
    )
    expect(order("ko-KR", "time", "minute", 12)).toBe(
      "dayPeriod   hour : minute"
    )
    expect(order("en-GB", "time", "second", 24)).toBe("hour : minute : second")
  })

  test("a digit that leaves no room for another finishes its segment", () => {
    const one = typeDigit(emptyFields(), null, "month", "1", 12)
    expect(one).toMatchObject({
      done: false,
      buffer: { type: "month", text: "1" },
    })
    expect(one.fields.month).toBe(1)
    const twelve = typeDigit(one.fields, one.buffer, "month", "2", 12)
    expect(twelve).toMatchObject({ done: true, buffer: null })
    expect(twelve.fields.month).toBe(12)
    expect(typeDigit(emptyFields(), null, "month", "4", 12)).toMatchObject({
      done: true,
    })
    expect(typeDigit(emptyFields(), null, "hour", "3", 24)).toMatchObject({
      done: true,
    })
    expect(typeDigit(emptyFields(), null, "hour", "2", 24)).toMatchObject({
      done: false,
    })
    expect(typeDigit(emptyFields(), null, "hour", "2", 12)).toMatchObject({
      done: true,
    })
  })

  test("a digit that doesn't fit starts the segment over", () => {
    const one = typeDigit(emptyFields(), null, "month", "1", 12)
    const next = typeDigit(one.fields, one.buffer, "month", "5", 12)
    expect(next.fields.month).toBe(5)
    expect(next.done).toBe(true)
  })

  test("a zero waits for the digit after it", () => {
    const zero = typeDigit(emptyFields(), null, "day", "0", 12)
    expect(zero.fields.day).toBeNull()
    expect(zero.done).toBe(false)
    expect(typeDigit(zero.fields, zero.buffer, "day", "7", 12).fields.day).toBe(
      7
    )
  })

  test("arrow keys wrap within a segment and leave the others alone", () => {
    const fields = fieldsOf("2026-12-31T23:59", {
      kind: "date",
      granularity: "minute",
      hourCycle: 24,
    })
    const minute = stepField(fields, "minute", 1, 24, 0)
    expect(minute).toMatchObject({ minute: 0, hour: 23, day: 31 })
    expect(stepField(fields, "month", 1, 24, 0)).toMatchObject({
      month: 1,
      year: 2026,
    })
  })

  test("a day past its month's end becomes the month's last day", () => {
    const fields = fieldsOf("2026-01-31", {
      kind: "date",
      granularity: "day",
      hourCycle: 24,
    })
    expect(stepField(fields, "month", 1, 24, 0)).toMatchObject({
      month: 2,
      day: 28,
    })
    const leap = fieldsOf("2028-01-31", {
      kind: "date",
      granularity: "day",
      hourCycle: 24,
    })
    expect(stepField(leap, "month", 1, 24, 0)).toMatchObject({
      month: 2,
      day: 29,
    })
  })

  test("a 12 hour clock keeps AM and PM apart from the hour", () => {
    const format = {
      kind: "time",
      granularity: "minute",
      hourCycle: 12,
    } as const
    expect(fieldsOf("00:30", format)).toMatchObject({ hour: 12, dayPeriod: 0 })
    expect(fieldsOf("12:30", format)).toMatchObject({ hour: 12, dayPeriod: 1 })
    expect(valueOf({ ...fieldsOf("13:05", format) }, format)).toBe("13:05")
    expect(
      valueOf({ ...emptyFields(), hour: 12, minute: 0, dayPeriod: 0 }, format)
    ).toBe("00:00")
    expect(
      valueOf({ ...emptyFields(), hour: 7, minute: 0, dayPeriod: null }, format)
    ).toBeNull()
  })

  test("values take the input's shape", () => {
    const date = { kind: "date", granularity: "day", hourCycle: 24 } as const
    const minute = {
      kind: "date",
      granularity: "minute",
      hourCycle: 24,
    } as const
    expect(normalizeValue("2026-11-02", date)).toBe("2026-11-02")
    expect(normalizeValue("2026-11-02T14:30:15", date)).toBe("2026-11-02")
    expect(normalizeValue("2026-11-02", minute)).toBe("2026-11-02T00:00")
    expect(normalizeValue("2026-02-30", date)).toBeNull()
    expect(
      normalizeValue("14:30:15", {
        kind: "time",
        granularity: "second",
        hourCycle: 24,
      })
    ).toBe("14:30:15")
    expect(
      normalizeValue("25:00", {
        kind: "time",
        granularity: "minute",
        hourCycle: 24,
      })
    ).toBeNull()
  })

  test("a bound with a date alone takes the whole day", () => {
    expect(compareTo("2026-12-31T23:59", "2026-12-31")).toBe(0)
    expect(compareTo("2027-01-01T00:00", "2026-12-31")).toBe(1)
    expect(compareTo("09:00", "09:30:00")).toBe(-1)
  })
})

type Instance = Omit<PrimitiveInstance, "get"> & {
  api: ReturnType<typeof dateInput>["api"]
  get: () => { value: string | null }
}

function mount(
  make: typeof dateInput | typeof timeInput,
  options: DateInputOptions | TimeInputOptions,
  { lang, dir }: { lang?: string; dir?: string } = {}
) {
  const instance = (make as typeof dateInput)({
    id: "d",
    locale: "en-US",
    ...(options as DateInputOptions),
  }) as unknown as Instance
  const container = document.createElement("div")
  if (lang) {
    container.lang = lang
  }
  if (dir) {
    container.dir = dir
  }
  document.body.append(container)
  const mounted = new Map<string, { el: HTMLElement; unbind: () => void }>()

  function el(
    key: string,
    slot: string,
    props: Record<string, unknown>,
    tag: string,
    parent: HTMLElement
  ) {
    const part = instance.part(slot as never, props as never)
    let entry = mounted.get(key)
    if (!entry) {
      const created = document.createElement(tag)
      parent.append(created)
      entry = { el: created, unbind: () => {} }
      mounted.set(key, entry)
      for (const [name, value] of Object.entries(attrs(part, props))) {
        if (value !== undefined) {
          created.setAttribute(name, value)
        }
      }
      entry.unbind = bind(part, created)
    }
    for (const [name, value] of Object.entries(attrs(part, props))) {
      if (name === "value") {
        continue
      } else if (value === undefined) {
        entry.el.removeAttribute(name)
      } else {
        entry.el.setAttribute(name, value)
      }
    }
    return entry.el
  }

  function render() {
    const root = el("root", "root", {}, "div", container)
    const { segments } = partState(
      instance.part("root" as never)
    ) as DateInputState
    for (const segment of segments) {
      const node = el(
        segment.key,
        "segment",
        { segment, id: segment.key },
        segment.editable ? "input" : "span",
        root
      )
      if (!segment.editable) {
        node.textContent = segment.text
      }
    }
    el("hidden", "hidden-input", {}, "input", root)
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

  const segment = (type: string) =>
    container.querySelector<HTMLInputElement>(`input[data-type="${type}"]`)!
  const type = (text: string) => {
    for (const char of text) {
      const target = document.activeElement as HTMLInputElement
      target.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: char,
          bubbles: true,
          cancelable: true,
        })
      )
    }
  }
  const key = (name: string) =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
      })
    )
  const backspace = () =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "deleteContentBackward",
        bubbles: true,
        cancelable: true,
      })
    )
  const text = () =>
    [
      ...container.querySelector(
        '[data-slot="date-input"],[data-slot="time-input"]'
      )!.children,
    ]
      .filter(
        (node) => !(node instanceof HTMLInputElement && node.type === "hidden")
      )
      .map((node) =>
        node instanceof HTMLInputElement
          ? node.value || node.placeholder
          : node.textContent
      )
      .join("")
      .replace(/\s/g, " ")
  const focused = () => document.activeElement?.getAttribute("data-type")
  return { instance, container, segment, type, key, backspace, text, focused }
}

describe("date input", () => {
  test("shows its value in the locale's segments and submits the ISO date", () => {
    const { text, container } = mount(dateInput, {
      defaultValue: "2026-11-02",
      name: "start",
    })
    expect(text()).toBe("11/02/2026")
    expect(
      container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value
    ).toBe("2026-11-02")
  })

  test("each segment is a spin button named by its unit", () => {
    const { segment } = mount(dateInput, { defaultValue: "2026-11-02" })
    expect(segment("month").getAttribute("role")).toBe("spinbutton")
    expect(segment("month").getAttribute("aria-label")).toBe("month")
    expect(segment("month").getAttribute("aria-valuenow")).toBe("11")
    expect(segment("day").getAttribute("aria-valuemax")).toBe("30")
    expect(segment("year").getAttribute("inputmode")).toBe("numeric")
  })

  test("typing fills a segment and moves on once it's done", async () => {
    const onValueChange = vi.fn()
    const { segment, type, focused, instance, text } = mount(dateInput, {
      onValueChange,
    })
    segment("month").focus()
    type("1")
    expect(focused()).toBe("month")
    type("1")
    expect(focused()).toBe("day")
    type("4")
    expect(focused()).toBe("year")
    type("2026")
    expect(instance.get().value).toBe("2026-11-04")
    await tick()
    expect(text()).toBe("11/04/2026")
    expect(
      onValueChange.mock.calls.map(([value, { reason }]) => [value, reason])
    ).toEqual([["2026-11-04", "input-change"]])
  })

  test("a separator moves on from a segment with a digit in it", () => {
    const { segment, type, focused } = mount(dateInput, {})
    segment("month").focus()
    type("1/")
    expect(focused()).toBe("day")
  })

  test("arrow keys step the segment, and left and right move between segments", () => {
    const { segment, key, focused, instance } = mount(dateInput, {
      defaultValue: "2026-11-02",
    })
    segment("day").focus()
    key("ArrowUp")
    expect(instance.get().value).toBe("2026-11-03")
    key("PageDown")
    expect(instance.get().value).toBe("2026-11-26")
    key("Home")
    expect(instance.get().value).toBe("2026-11-01")
    key("ArrowRight")
    expect(focused()).toBe("year")
    key("ArrowLeft")
    key("ArrowLeft")
    expect(focused()).toBe("month")
  })

  test("left and right follow the page's direction", () => {
    const { segment, key, focused } = mount(
      dateInput,
      { defaultValue: "2026-11-02" },
      { dir: "rtl" }
    )
    segment("day").focus()
    key("ArrowLeft")
    expect(focused()).toBe("year")
  })

  test("Backspace empties a segment, then moves back, and the value goes", async () => {
    const onValueChange = vi.fn()
    const { segment, backspace, focused, instance } = mount(dateInput, {
      defaultValue: "2026-11-02",
      onValueChange,
    })
    segment("day").focus()
    backspace()
    expect(instance.get().value).toBeNull()
    await tick()
    expect(segment("day").getAttribute("data-empty")).toBe("")
    backspace()
    expect(focused()).toBe("month")
    expect(onValueChange).toHaveBeenCalledTimes(1)
  })

  test("Backspace works from the key alone, as WebKit sends no beforeinput on an empty segment", async () => {
    const { segment, key, focused, instance } = mount(dateInput, {
      defaultValue: "2026-11-02",
    })
    segment("day").focus()
    key("Backspace")
    expect(instance.get().value).toBeNull()
    await tick()
    key("Backspace")
    expect(focused()).toBe("month")
  })

  test("a partly filled date is a bad input until it's whole", async () => {
    const { segment, type } = mount(dateInput, {})
    segment("month").focus()
    type("4")
    await tick()
    expect(segment("month").validationMessage).toBe("Enter a valid date.")
  })

  test("a value outside the bounds or on an unavailable date is invalid", () => {
    const { instance, container, segment } = mount(dateInput, {
      defaultValue: "2026-11-02",
      min: "2026-11-05",
      unavailable: "2026-11-10",
    })
    expect(container.firstElementChild!.hasAttribute("data-invalid")).toBe(true)
    expect(segment("month").getAttribute("aria-invalid")).toBe("true")
    instance.api.setValue("2026-11-06")
    expect(
      (partState(instance.part("root" as never)) as DateInputState).invalid
    ).toBe(false)
    instance.api.setValue("2026-11-10")
    expect(
      (partState(instance.part("root" as never)) as DateInputState).invalid
    ).toBe(true)
  })

  test("a controlled value that's turned down puts the segments back", async () => {
    const { segment, type, text } = mount(dateInput, {
      value: "2026-11-02",
      onValueChange: () => {},
    })
    segment("day").focus()
    type("05")
    await tick()
    expect(text()).toBe("11/02/2026")
  })

  test("a canceled change keeps the value", () => {
    const { segment, key, instance } = mount(dateInput, {
      defaultValue: "2026-11-02",
      onValueChange: (_value, details) => details.cancel(),
    })
    segment("day").focus()
    key("ArrowUp")
    expect(instance.get().value).toBe("2026-11-02")
  })

  test("a date and time adds hour, minute and AM/PM", async () => {
    const { text, segment, type, instance } = mount(dateInput, {
      defaultValue: "2026-11-02T14:05",
      granularity: "minute",
    })
    expect(text()).toBe("11/02/2026, 02:05 PM")
    segment("dayPeriod").focus()
    type("a")
    expect(instance.get().value).toBe("2026-11-02T02:05")
  })

  test("the page's language orders the segments", () => {
    const { text } = mount(
      dateInput,
      { defaultValue: "2026-11-02", locale: undefined },
      { lang: "de-DE" }
    )
    expect(text()).toBe("02.11.2026")
  })

  test("pasting a whole date sets it", () => {
    const { segment, instance } = mount(dateInput, {})
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "12/25/2026" },
    })
    segment("day").dispatchEvent(event)
    expect(instance.get().value).toBe("2026-12-25")
  })

  test("pasting a date in the locale's order sets it", () => {
    const { segment, instance } = mount(dateInput, { locale: "en-GB" })
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "25/12/2026" },
    })
    segment("day").dispatchEvent(event)
    expect(instance.get().value).toBe("2026-12-25")
  })

  test("February 29 stays while its leap year is typed", () => {
    for (const [locale, first, digits, value] of [
      ["en-US", "month", "02292028", "2028-02-29"],
      ["en-GB", "day", "29022028", "2028-02-29"],
      ["en-US", "month", "02292027", "2027-02-28"],
    ]) {
      const { segment, type, instance } = mount(dateInput, { locale })
      segment(first!).focus()
      type(digits!)
      expect(instance.get().value).toBe(value)
    }
    const { segment, type, instance } = mount(dateInput, {
      defaultValue: "2028-02-29",
    })
    segment("year").focus()
    type("2032")
    expect(instance.get().value).toBe("2032-02-29")
  })

  test("an input outside its form still stops that form submitting", async () => {
    const form = Object.assign(document.createElement("form"), {
      id: "outside",
    })
    document.body.append(form)
    const required = mount(dateInput, { form: "outside", required: true })
    expect(form.checkValidity()).toBe(false)
    cleanups.splice(0).forEach((cleanup) => cleanup())
    required.container.remove()
    mount(dateInput, {
      form: "outside",
      defaultValue: "2026-11-02",
      min: "2026-11-05",
    })
    await tick()
    expect(form.checkValidity()).toBe(false)
  })

  test("a form reset goes back to the default value", async () => {
    const { segment, key, instance } = mount(dateInput, {
      defaultValue: "2026-11-02",
    })
    segment("day").focus()
    key("ArrowUp")
    instance.api.internal.reset()
    expect(instance.get().value).toBe("2026-11-02")
  })
})

describe("time input", () => {
  test("shows hours and minutes on the locale's clock", () => {
    expect(mount(timeInput, { defaultValue: "14:30" }).text()).toBe("02:30 PM")
    expect(
      mount(timeInput, { defaultValue: "14:30", hourCycle: 24 }).text()
    ).toBe("14:30")
    expect(
      mount(timeInput, {
        defaultValue: "14:30:15",
        granularity: "second",
        hourCycle: 24,
      }).text()
    ).toBe("14:30:15")
  })

  test("typing a time on a 24 hour clock", () => {
    const { segment, type, instance } = mount(timeInput, { hourCycle: 24 })
    segment("hour").focus()
    type("930")
    expect(instance.get().value).toBe("09:30")
  })

  test("Enter keeps a digit still waiting for the next, before the form submits", () => {
    const { segment, type, key, instance } = mount(timeInput, {
      defaultValue: "09:30",
      hourCycle: 24,
    })
    segment("minute").focus()
    type("4")
    expect(instance.get().value).toBe("09:30")
    key("Enter")
    expect(instance.get().value).toBe("09:04")
  })

  test("arrow keys wrap minutes without moving the hour", () => {
    const { segment, key, instance } = mount(timeInput, {
      defaultValue: "09:59",
      hourCycle: 24,
    })
    segment("minute").focus()
    key("ArrowUp")
    expect(instance.get().value).toBe("09:00")
  })

  test("an empty segment starts at its first value on ArrowUp and its last on ArrowDown", () => {
    const { segment, key } = mount(timeInput, { hourCycle: 24 })
    segment("minute").focus()
    key("ArrowDown")
    expect(segment("minute").value).toBe("59")
  })

  test("a time after max is invalid", () => {
    const { container } = mount(timeInput, {
      defaultValue: "18:00",
      max: "17:30",
    })
    expect(container.firstElementChild!.hasAttribute("data-invalid")).toBe(true)
  })
})

describe("Enter beside segments", () => {
  const formWith = (root: ParentNode, extra = "") => {
    const form = document.createElement("form")
    form.innerHTML = `<input class="segment"><input class="segment"><input class="note">${extra}`
    root.append(form)
    const unbinds = Array.from(
      form.querySelectorAll<HTMLInputElement>(".segment"),
      bindSegmentSubmit
    )
    cleanups.push(() => unbinds.forEach((unbind) => unbind()))
    const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {})
    const enter = () =>
      form.querySelector(".note")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          composed: true,
        })
      )
    return { submit, enter }
  }

  test("submits a form inside a shadow root", () => {
    const host = document.createElement("div")
    document.body.append(host)
    const { submit, enter } = formWith(host.attachShadow({ mode: "open" }))
    enter()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  test("leaves a form with an image button to the browser", () => {
    const { submit, enter } = formWith(document.body, '<input type="image">')
    enter()
    expect(submit).not.toHaveBeenCalled()
  })
})
