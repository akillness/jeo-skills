// @vitest-environment jsdom
// Calendar through a small adapter that renders like a framework does: a
// microtask after a change, with days keyed by their date inside each week.
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  calendar,
  type CalendarGridState,
  type CalendarOptions,
  type CalendarSelectState,
} from "../src/components/calendar/calendar"
import {
  gridWeeks,
  matchesDate,
  monthToShow,
  moveDate,
  pressRange,
} from "../src/components/calendar/calendar-model"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import { attrs, bind, partState } from "../src/foundation/kernel/part"
import { expectNoMissedUpdates, type Part } from "./selects"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  vi.useRealTimers()
})

const tick = () => new Promise((resolve) => setTimeout(resolve))

function mount(
  options: CalendarOptions = {},
  { lang, dir }: { lang?: string; dir?: string } = {}
) {
  const instance = calendar({
    id: "c",
    today: "2026-10-16",
    ...options,
  }) as ReturnType<typeof calendar> & PrimitiveInstance
  const container = document.createElement("div")
  if (lang) {
    container.lang = lang
  }
  if (dir) {
    container.dir = dir
  }
  document.body.append(container)
  const mounted = new Map<string, { el: HTMLElement; unbind: () => void }>()
  let seen = new Set<string>()

  // The element for a part under `parent`, made and bound the first time, its attributes written every render.
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
      if (value === undefined) {
        entry.el.removeAttribute(name)
      } else {
        entry.el.setAttribute(name, value)
      }
    }
    return { el: entry.el, part }
  }

  function render() {
    seen = new Set()
    const root = el("root", "root", {}, "div", container).el
    const heading = el("heading", "heading", {}, "h2", root)
    const headingState = partState(heading.part) as {
      label: string
      month: string
    }
    heading.el.textContent = headingState.label
    heading.el.dataset.month = headingState.month
    el("previous", "previous", {}, "button", root)
    el("next", "next", {}, "button", root)
    const { months } = instance.get() as { months: number }
    for (let offset = 0; offset < months; offset++) {
      const grid = el(
        `grid:${offset}`,
        "grid",
        { offset, id: String(offset) },
        "table",
        root
      )
      const state = partState(grid.part) as CalendarGridState
      const head = el(
        `weekdays:${offset}`,
        "weekdays",
        { id: String(offset) },
        "tr",
        grid.el
      ).el
      state.weekdays.forEach((_, index) => {
        const id = `${offset}-${index}`
        const weekday = el(
          `weekday:${id}`,
          "weekday",
          { index, id },
          "th",
          head
        )
        weekday.el.textContent = (
          partState(weekday.part) as { label: string }
        ).label
      })
      state.weeks.forEach((week, index) => {
        const row = el(
          `week:${offset}:${index}`,
          "week",
          { id: `${offset}-${index}` },
          "tr",
          grid.el
        ).el
        for (const cell of week) {
          if (cell.hidden) {
            continue
          }
          const day = el(
            `day:${offset}:${index}:${cell.date}`,
            "day",
            { value: cell.date, offset },
            "td",
            row
          )
          day.el.textContent = (partState(day.part) as { label: string }).label
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

  const day = (date: string) =>
    container.querySelector<HTMLElement>(
      `[data-value="${date}"]:not([data-outside])`
    )!
  const press = (key: string, init: KeyboardEventInit = {}) =>
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
    )
  const focused = () =>
    (document.activeElement as HTMLElement).getAttribute("data-value")
  const stops = () =>
    [...container.querySelectorAll("[data-value]")]
      .filter((cell) => cell.getAttribute("tabindex") === "0")
      .map((cell) => cell.getAttribute("data-value"))
  // Intl puts thin spaces around a range's dash.
  const heading = () =>
    container.querySelector("h2")!.textContent!.replace(/\s/g, " ")
  const button = (name: "previous" | "next") => mounted.get(name)!.el
  return {
    instance,
    container,
    day,
    press,
    focused,
    stops,
    heading,
    button,
    render,
  }
}

describe("the calendar model", () => {
  test("matchers name dates by data or by function", () => {
    const matchers = [
      "2026-10-24",
      { from: "2026-12-24", to: "2026-12-26" },
      { weekday: [0] },
      (date: string) => date.endsWith("-13"),
    ]
    expect(matchesDate("2026-10-24", matchers)).toBe(true)
    expect(matchesDate("2026-12-25", matchers)).toBe(true)
    expect(matchesDate("2026-10-18", matchers)).toBe(true)
    expect(matchesDate("2026-11-13", matchers)).toBe(true)
    expect(matchesDate("2026-10-16", matchers)).toBe(false)
    expect(matchesDate("2026-10-01", { before: "2026-10-02" })).toBe(true)
    expect(matchesDate("2026-10-01", { after: "2026-10-01" })).toBe(false)
    expect(matchesDate("2026-10-01", null)).toBe(false)
  })

  test("keys move by day, week, month and year, and stop at min and max", () => {
    const options = { rtl: false, weekStartsOn: 0 }
    expect(moveDate({ key: "ArrowRight" }, "2026-10-31", options)).toBe(
      "2026-11-01"
    )
    expect(
      moveDate({ key: "ArrowLeft" }, "2026-10-31", { ...options, rtl: true })
    ).toBe("2026-11-01")
    expect(moveDate({ key: "ArrowUp" }, "2026-10-01", options)).toBe(
      "2026-09-24"
    )
    expect(moveDate({ key: "Home" }, "2026-10-16", options)).toBe("2026-10-11")
    expect(
      moveDate({ key: "End" }, "2026-10-16", { ...options, weekStartsOn: 1 })
    ).toBe("2026-10-18")
    expect(moveDate({ key: "PageDown" }, "2026-01-31", options)).toBe(
      "2026-02-28"
    )
    expect(
      moveDate({ key: "PageUp", shiftKey: true }, "2028-02-29", options)
    ).toBe("2027-02-28")
    expect(
      moveDate({ key: "ArrowDown" }, "2026-10-28", {
        ...options,
        max: "2026-10-30",
      })
    ).toBe("2026-10-30")
    expect(moveDate({ key: "a" }, "2026-10-28", options)).toBeUndefined()
  })

  test("the months turn only as far as a date needs", () => {
    expect(monthToShow("2026-11-01", "2026-10", 1, "month")).toBe("2026-11")
    expect(monthToShow("2026-11-01", "2026-10", 2, "month")).toBe("2026-10")
    expect(monthToShow("2026-12-01", "2026-10", 2, "month")).toBe("2026-11")
    expect(monthToShow("2026-12-01", "2026-10", 2, "page")).toBe("2026-12")
    expect(monthToShow("2026-09-30", "2026-10", 2, "page")).toBe("2026-08")
  })

  test("a range starts, ends on either side of its start, and keeps its start through an end the rules refuse", () => {
    const rules = {
      allowUnavailable: false,
      isUnavailable: (date: string) => date === "2026-10-20",
      minDays: 2,
    }
    expect(pressRange(null, "2026-10-16", rules)).toEqual({
      anchor: "2026-10-16",
      value: undefined,
    })
    expect(pressRange("2026-10-16", "2026-10-18", rules)).toEqual({
      anchor: null,
      value: ["2026-10-16", "2026-10-18"],
    })
    expect(pressRange("2026-10-16", "2026-10-14", rules)).toEqual({
      anchor: null,
      value: ["2026-10-14", "2026-10-16"],
    })
    expect(pressRange("2026-10-16", "2026-10-16", rules)).toEqual({
      anchor: "2026-10-16",
      value: undefined,
    })
    expect(pressRange("2026-10-16", "2026-10-22", rules)).toEqual({
      anchor: "2026-10-16",
      value: undefined,
    })
    expect(
      pressRange("2026-10-16", "2026-10-22", {
        ...rules,
        allowUnavailable: true,
      }).value
    ).toEqual(["2026-10-16", "2026-10-22"])
  })

  test("outside days show only at the outer edges of the months shown", () => {
    const options = {
      weekStartsOn: 0,
      fixedWeeks: false,
      showOutsideDays: true,
    }
    const first = gridWeeks("2026-10", { ...options, first: true, last: false })
    const last = gridWeeks("2026-11", { ...options, first: false, last: true })
    expect(first[0]!.slice(0, 4).map((cell) => cell.hidden)).toEqual([
      false,
      false,
      false,
      false,
    ])
    expect(first[0]![0]).toEqual({
      date: "2026-09-27",
      outside: true,
      hidden: false,
    })
    expect(
      last.at(-1)!.filter((cell) => cell.outside && !cell.hidden).length
    ).toBe(5)
    expect(
      gridWeeks("2026-11", { ...options, first: false, last: false })
        .at(-1)!
        .at(-1)!.hidden
    ).toBe(true)
  })
})

describe("calendar", () => {
  test("renders a month with its weekdays, heading and labels", () => {
    const { container, heading, day } = mount({ defaultMonth: "2026-10" })
    expect(heading()).toBe("October 2026")
    expect(
      [...container.querySelectorAll("th")].map((th) => th.textContent)
    ).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
    expect(container.querySelector("th")!.getAttribute("aria-label")).toBe(
      "Sunday"
    )
    expect(container.querySelector("table")!.getAttribute("role")).toBe("grid")
    expect(container.querySelector("table")!.getAttribute("aria-label")).toBe(
      "October 2026"
    )
    expect(container.querySelectorAll("[role=row]").length).toBe(6)
    expect(day("2026-10-16").getAttribute("aria-label")).toBe(
      "Friday, October 16, 2026"
    )
    expect(day("2026-10-16").textContent).toBe("16")
    expect(day("2026-10-16").getAttribute("aria-current")).toBe("date")
    expect(
      container
        .querySelector('[data-value="2026-09-27"]')!
        .hasAttribute("data-outside")
    ).toBe(true)
    expect(
      container
        .querySelector('[data-value="2026-09-27"]')!
        .hasAttribute("tabindex")
    ).toBe(false)
  })

  test("monthFormat writes the heading's month names, while the grid keeps the full name", () => {
    const { container, heading } = mount({
      defaultMonth: "2026-10",
      monthFormat: "short",
    })
    expect(heading()).toBe("Oct 2026")
    expect(container.querySelector("table")!.getAttribute("aria-label")).toBe(
      "October 2026"
    )
    expect(
      mount({
        defaultMonth: "2026-10",
        months: 2,
        monthFormat: "short",
      }).heading()
    ).toMatch(/^Oct . Nov 2026$/)
  })

  test("the heading's state has the first month shown, to format it yourself", () => {
    const { container } = mount({ defaultMonth: "2026-10", months: 2 })
    expect(container.querySelector("h2")!.dataset.month).toBe("2026-10")
  })

  test("the page's language sets the names and the first day of the week", async () => {
    const { container, heading } = mount(
      { defaultMonth: "2026-10" },
      { lang: "de-DE" }
    )
    await tick()
    expect(heading()).toBe("Oktober 2026")
    expect(container.querySelector("th")!.textContent).toBe("Mo")
    expect(
      container.querySelector("[data-value]")!.getAttribute("data-value")
    ).toBe("2026-09-28")
  })

  test("the tab stop starts on the selection, else today, else the first date that can be picked", async () => {
    expect(mount({ defaultValue: "2026-10-20" }).stops()).toEqual([
      "2026-10-20",
    ])
    document.body.replaceChildren()
    expect(mount({}).stops()).toEqual(["2026-10-16"])
    document.body.replaceChildren()
    expect(
      mount({ defaultMonth: "2026-11", min: "2026-11-03" }).stops()
    ).toEqual(["2026-11-03"])
  })

  test("server markup has one tab stop and no today, which waits for the client", () => {
    const instance = calendar({
      id: "s",
      defaultMonth: "2026-10",
    }) as PrimitiveInstance
    const stops = ["2026-10-01", "2026-10-16", "2026-10-31"].map(
      (value) => attrs(instance.part("day", { value })).tabindex
    )
    expect(stops).toEqual(["0", "-1", "-1"])
    expect(
      attrs(instance.part("day", { value: "2026-10-16" }))["aria-current"]
    ).toBeUndefined()
  })

  test("arrow keys move by day and week, into the next month as it renders", async () => {
    const onMonthChange = vi.fn()
    const { day, press, focused, heading, stops } = mount({
      defaultValue: "2026-10-30",
      onMonthChange,
    })
    await tick()
    day("2026-10-30").focus()
    press("ArrowRight")
    expect(focused()).toBe("2026-10-31")
    press("ArrowRight")
    await tick()
    expect(heading()).toBe("November 2026")
    expect(focused()).toBe("2026-11-01")
    expect(stops()).toEqual(["2026-11-01"])
    expect(onMonthChange).toHaveBeenCalledWith(
      "2026-11",
      expect.objectContaining({ reason: "list-navigation" })
    )
    press("ArrowUp")
    await tick()
    expect(heading()).toBe("October 2026")
    expect(focused()).toBe("2026-10-25")
  })

  test("Page Up and Down turn months, with Shift years, and Home and End go to the week's ends", async () => {
    const { day, press, focused, heading } = mount({
      defaultValue: "2026-10-16",
    })
    await tick()
    day("2026-10-16").focus()
    press("PageDown")
    await tick()
    expect([heading(), focused()]).toEqual(["November 2026", "2026-11-16"])
    press("PageDown", { shiftKey: true })
    await tick()
    expect([heading(), focused()]).toEqual(["November 2027", "2027-11-16"])
    press("Home")
    expect(focused()).toBe("2027-11-14")
    press("End")
    expect(focused()).toBe("2027-11-20")
  })

  test("Left and Right swap in a right-to-left page", async () => {
    const { day, press, focused } = mount(
      { defaultValue: "2026-10-16" },
      { dir: "rtl" }
    )
    await tick()
    day("2026-10-16").focus()
    press("ArrowLeft")
    expect(focused()).toBe("2026-10-17")
  })

  test("keys stop at min and max, and so do Previous and Next", async () => {
    const { day, press, focused, button } = mount({
      defaultValue: "2026-10-10",
      min: "2026-10-10",
      max: "2026-10-20",
    })
    await tick()
    day("2026-10-10").focus()
    press("ArrowLeft")
    expect(focused()).toBe("2026-10-10")
    press("PageDown")
    expect(focused()).toBe("2026-10-20")
    expect(button("previous").getAttribute("aria-disabled")).toBe("true")
    expect(button("next").getAttribute("aria-disabled")).toBe("true")
    expect(day("2026-10-21").getAttribute("aria-disabled")).toBe("true")
  })

  test("Previous and Next turn the month and keep the tab stop in the grid", async () => {
    const onMonthChange = vi.fn()
    const { button, heading, stops } = mount({
      defaultMonth: "2026-10",
      onMonthChange,
    })
    await tick()
    button("next").click()
    await tick()
    expect(heading()).toBe("November 2026")
    expect(onMonthChange).toHaveBeenCalledWith(
      "2026-11",
      expect.objectContaining({ reason: "next-press" })
    )
    expect(stops()).toEqual(["2026-11-01"])
    button("previous").click()
    await tick()
    expect(heading()).toBe("October 2026")
    expect(stops()).toEqual(["2026-10-16"])
  })

  test("a press or Enter selects one date", async () => {
    const onValueChange = vi.fn()
    const { day, press, instance } = mount({ onValueChange })
    await tick()
    day("2026-10-20").click()
    expect(onValueChange).toHaveBeenLastCalledWith(
      "2026-10-20",
      expect.objectContaining({ reason: "item-press" })
    )
    await tick()
    expect(day("2026-10-20").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(day("2026-10-20"))
    press("ArrowRight")
    press("Enter")
    expect(instance.api.getValue()).toBe("2026-10-21")
  })

  test("multiple mode toggles dates and keeps them sorted", async () => {
    const { day, container, instance } = mount({ mode: "multiple" })
    await tick()
    expect(
      container.querySelector("table")!.getAttribute("aria-multiselectable")
    ).toBe("true")
    day("2026-10-20").click()
    day("2026-10-02").click()
    expect(instance.api.getValue()).toEqual(["2026-10-02", "2026-10-20"])
    day("2026-10-20").click()
    expect(instance.api.getValue()).toEqual(["2026-10-02"])
  })

  test("a range previews as the end moves, changes once both ends are picked, and Escape drops its start", async () => {
    const onValueChange = vi.fn()
    const { day, press, instance } = mount({ mode: "range", onValueChange })
    await tick()
    day("2026-10-16").click()
    expect(onValueChange).not.toHaveBeenCalled()
    day("2026-10-19").dispatchEvent(new PointerEvent("pointerenter"))
    await tick()
    expect(day("2026-10-17").hasAttribute("data-range-middle")).toBe(true)
    expect(day("2026-10-19").hasAttribute("data-range-end")).toBe(true)
    expect(day("2026-10-17").hasAttribute("data-preview")).toBe(true)
    day("2026-10-19").click()
    expect(onValueChange).toHaveBeenLastCalledWith(
      ["2026-10-16", "2026-10-19"],
      expect.anything()
    )
    await tick()
    expect(day("2026-10-17").getAttribute("aria-selected")).toBe("true")
    expect(day("2026-10-17").hasAttribute("data-preview")).toBe(false)
    // A new range starts on the next press, and Escape drops it, keeping the value.
    press("Enter")
    expect(instance.get()).toMatchObject({ anchor: "2026-10-19" })
    press("ArrowRight")
    expect(instance.get()).toMatchObject({ hover: "2026-10-20" })
    press("Escape")
    expect(instance.get()).toMatchObject({
      anchor: null,
      value: ["2026-10-16", "2026-10-19"],
    })
  })

  test("a range keeps to minDays, maxDays and unavailable dates, keeping its start through an end they refuse", () => {
    const { day, instance } = mount({
      mode: "range",
      minDays: 3,
      maxDays: 5,
      unavailable: "2026-10-21",
    })
    day("2026-10-16").click()
    day("2026-10-17").click()
    expect(instance.get()).toMatchObject({ anchor: "2026-10-16", value: null })
    day("2026-10-23").click()
    expect(instance.get()).toMatchObject({ anchor: "2026-10-16", value: null })
    day("2026-10-18").click()
    expect(instance.api.getValue()).toEqual(["2026-10-16", "2026-10-18"])
    day("2026-10-19").click()
    day("2026-10-23").click()
    expect(instance.get()).toMatchObject({
      anchor: "2026-10-19",
      value: ["2026-10-16", "2026-10-18"],
    })
  })

  test("while a range is picked, the days that can't end it read as disabled", async () => {
    const { day } = mount({
      mode: "range",
      minDays: 3,
      maxDays: 5,
      unavailable: "2026-10-21",
    })
    await tick()
    day("2026-10-16").click()
    await tick()
    const disabled = (date: string) =>
      day(date).getAttribute("aria-disabled") === "true"
    expect(["2026-10-16", "2026-10-18", "2026-10-20"].some(disabled)).toBe(
      false
    )
    expect(["2026-10-15", "2026-10-17", "2026-10-22"].every(disabled)).toBe(
      true
    )
    day("2026-10-18").click()
    await tick()
    expect(disabled("2026-10-17")).toBe(false)
  })

  test("a range ends before its start, which then becomes its end, and previews that way", async () => {
    const { day, instance } = mount({ mode: "range" })
    await tick()
    day("2026-10-20").click()
    day("2026-10-17").dispatchEvent(new PointerEvent("pointerenter"))
    await tick()
    expect(day("2026-10-17").hasAttribute("data-range-start")).toBe(true)
    expect(day("2026-10-18").hasAttribute("data-range-middle")).toBe(true)
    expect(day("2026-10-20").hasAttribute("data-range-end")).toBe(true)
    day("2026-10-17").click()
    expect(instance.api.getValue()).toEqual(["2026-10-17", "2026-10-20"])
  })

  test("the root state and its events follow the tab stop and a range's start", async () => {
    const onFocusedChange = vi.fn()
    const onAnchorChange = vi.fn()
    const { day, press, instance } = mount({
      mode: "range",
      onFocusedChange,
      onAnchorChange,
    })
    await tick()
    instance.api.setMonth("2026-12")
    await tick()
    instance.api.setMonth("2026-10")
    await tick()
    expect(onFocusedChange).not.toHaveBeenCalled()
    day("2026-10-16").focus()
    expect(onFocusedChange).not.toHaveBeenCalled()
    day("2026-10-15").focus()
    expect(onFocusedChange).toHaveBeenLastCalledWith(
      "2026-10-15",
      expect.objectContaining({ reason: "focus-in" })
    )
    press("ArrowRight")
    expect(onFocusedChange).toHaveBeenLastCalledWith(
      "2026-10-16",
      expect.objectContaining({ reason: "list-navigation" })
    )
    instance.api.focus("2026-10-20")
    expect(onFocusedChange).toHaveBeenLastCalledWith(
      "2026-10-20",
      expect.objectContaining({ reason: "imperative" })
    )
    press("Enter")
    expect(onAnchorChange).toHaveBeenLastCalledWith(
      "2026-10-20",
      expect.objectContaining({ reason: "item-press" })
    )
    expect(partState(instance.part("root", {}))).toMatchObject({
      focused: "2026-10-20",
      anchor: "2026-10-20",
    })
    press("Escape")
    expect(onAnchorChange).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ reason: "escape-key" })
    )
    expect(onFocusedChange).toHaveBeenCalledTimes(3)
  })

  test("canceling a focus change keeps focus on the day it was on", async () => {
    const { day, press, focused, instance } = mount({
      onFocusedChange: (date, details) => {
        if (date !== "2026-10-16") {
          details.cancel()
        }
      },
    })
    await tick()
    day("2026-10-16").focus()
    press("ArrowRight")
    instance.api.focus("2026-11-20")
    day("2026-10-12").focus()
    await tick()
    expect(focused()).toBe("2026-10-16")
    expect(instance.api.getMonth()).toBe("2026-10")
    expect(day("2026-10-16").getAttribute("tabindex")).toBe("0")
  })

  test("pressing another month's day before min keeps the month and focus where they were", async () => {
    const { container, day, focused, instance } = mount({ min: "2026-10-01" })
    await tick()
    day("2026-10-16").focus()
    container
      .querySelector<HTMLElement>('[data-value="2026-09-28"][data-outside]')!
      .click()
    await tick()
    expect(instance.api.getMonth()).toBe("2026-10")
    expect(focused()).toBe("2026-10-16")
  })

  test("pressing another month's day after max keeps the month", async () => {
    const { container, instance } = mount({
      defaultMonth: "2026-11",
      max: "2026-11-30",
    })
    await tick()
    container
      .querySelector<HTMLElement>('[data-value="2026-12-02"][data-outside]')!
      .click()
    await tick()
    expect(instance.api.getMonth()).toBe("2026-11")
  })

  test("pressing another month's day before a min in the middle of that month keeps the month", async () => {
    const { container, instance } = mount({ min: "2026-09-29" })
    await tick()
    container
      .querySelector<HTMLElement>('[data-value="2026-09-28"][data-outside]')!
      .click()
    await tick()
    expect(instance.api.getMonth()).toBe("2026-10")
  })

  test("pressing another month's unavailable day within min and max still shows its month, picking nothing", async () => {
    const onValueChange = vi.fn()
    const { container, instance } = mount({
      unavailable: ["2026-09-28"],
      onValueChange,
    })
    await tick()
    container
      .querySelector<HTMLElement>('[data-value="2026-09-28"][data-outside]')!
      .click()
    await tick()
    expect(instance.api.getMonth()).toBe("2026-09")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("a press whose focus change is canceled asks once, as a press", async () => {
    const onFocusedChange = vi.fn(
      (_date: string, details: { cancel: () => void }) => details.cancel()
    )
    const { day, focused } = mount({ onFocusedChange })
    await tick()
    day("2026-10-16").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    )
    day("2026-10-20").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true })
    )
    day("2026-10-20").dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 })
    )
    expect(focused()).toBe("2026-10-16")
    expect(onFocusedChange).toHaveBeenCalledOnce()
    expect(onFocusedChange).toHaveBeenCalledWith(
      "2026-10-20",
      expect.objectContaining({ reason: "item-press" })
    )
  })

  // Safari focuses nothing on mousedown, so the click's own focus call is what moves focus.
  const safariPress = (el: HTMLElement) => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
  }

  test("a Safari press focuses the day it clicks", async () => {
    const onFocusedChange = vi.fn()
    const { day, focused } = mount({ onFocusedChange })
    await tick()
    day("2026-10-16").focus()
    safariPress(day("2026-10-20"))
    expect(focused()).toBe("2026-10-20")
    expect(onFocusedChange).toHaveBeenCalledWith(
      "2026-10-20",
      expect.objectContaining({ reason: "item-press" })
    )
  })

  test("a Safari press on a day a refused press left focuses it once focus is allowed", async () => {
    let cancel = true
    const { day, focused } = mount({
      onFocusedChange: (_date, details) => {
        if (cancel) {
          details.cancel()
        }
      },
    })
    await tick()
    day("2026-10-16").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    )
    day("2026-10-20").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true })
    )
    day("2026-10-20").dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 })
    )
    expect(focused()).toBe("2026-10-16")
    cancel = false
    safariPress(day("2026-10-20"))
    expect(focused()).toBe("2026-10-20")
  })

  test("a refused press released off its day doesn't keep a later click from focusing it", async () => {
    let cancel = true
    const { day, focused } = mount({
      onFocusedChange: (_date, details) => {
        if (cancel) {
          details.cancel()
        }
      },
    })
    await tick()
    day("2026-10-16").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    )
    day("2026-10-20").focus()
    day("2026-10-16").dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true })
    )
    cancel = false
    day("2026-10-20").click()
    expect(focused()).toBe("2026-10-20")
  })

  test("a refused press that never clicks, like a right-button one, doesn't keep a later click from focusing its day", async () => {
    let cancel = true
    const { day, focused } = mount({
      onFocusedChange: (_date, details) => {
        if (cancel) {
          details.cancel()
        }
      },
    })
    await tick()
    day("2026-10-16").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 2 })
    )
    day("2026-10-20").focus()
    day("2026-10-20").dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 2 })
    )
    cancel = false
    day("2026-10-20").click()
    expect(focused()).toBe("2026-10-20")
  })

  // Chromium and Firefox focus a cell with a tabindex on mousedown, unless it's prevented.
  const chromiumPress = (el: HTMLElement) => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    const mousedown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    })
    if (el.dispatchEvent(mousedown) && el.hasAttribute("tabindex")) {
      el.focus()
    }
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
  }

  test.each([
    ["Chromium", chromiumPress],
    ["Safari", safariPress],
  ])(
    "a %s press on a day before min or after max leaves focus where it was",
    async (_, press) => {
      const { day, focused } = mount({ min: "2026-10-10", max: "2026-10-25" })
      await tick()
      expect(day("2026-10-05").hasAttribute("tabindex")).toBe(false)
      expect(day("2026-10-28").hasAttribute("tabindex")).toBe(false)
      day("2026-10-16").focus()
      press(day("2026-10-05"))
      press(day("2026-10-28"))
      await tick()
      expect(focused()).toBe("2026-10-16")
      expect(day("2026-10-16").getAttribute("tabindex")).toBe("0")
    }
  )

  test("an unavailable day still takes focus from a press", async () => {
    const { day, focused } = mount({ unavailable: ["2026-10-05"] })
    await tick()
    expect(day("2026-10-05").getAttribute("tabindex")).toBe("-1")
    day("2026-10-16").focus()
    chromiumPress(day("2026-10-05"))
    expect(focused()).toBe("2026-10-05")
  })

  test("canceling an anchor change keeps a range's start as it was", async () => {
    let cancel = false
    const { day, instance } = mount({
      mode: "range",
      onAnchorChange: (_anchor, details) => {
        if (cancel) {
          details.cancel()
        }
      },
    })
    day("2026-10-16").click()
    cancel = true
    day("2026-10-20").click()
    expect(instance.api.getValue()).toBeNull()
    expect(partState(instance.part("root", {}))).toMatchObject({
      anchor: "2026-10-16",
    })
  })

  test("deselectable clears the selected date when it's pressed again", () => {
    const onValueChange = vi.fn()
    const { day, instance } = mount({
      defaultValue: "2026-10-16",
      deselectable: true,
      onValueChange,
    })
    day("2026-10-16").click()
    expect(instance.api.getValue()).toBeNull()
    expect(onValueChange).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ reason: "item-press" })
    )
    day("2026-10-16").click()
    expect(instance.api.getValue()).toBe("2026-10-16")
  })

  test("unavailable dates are focusable but can't be picked", async () => {
    const onValueChange = vi.fn()
    const { day, press, focused } = mount({
      defaultValue: "2026-10-16",
      unavailable: { weekday: [0, 6] },
      onValueChange,
    })
    await tick()
    expect(day("2026-10-17").getAttribute("aria-disabled")).toBe("true")
    expect(day("2026-10-17").hasAttribute("data-unavailable")).toBe(true)
    day("2026-10-16").focus()
    press("ArrowRight")
    expect(focused()).toBe("2026-10-17")
    press("Enter")
    day("2026-10-17").click()
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("two months show side by side, with outside days only at the edges", async () => {
    const { container, day, press, focused, heading } = mount({
      months: 2,
      defaultMonth: "2026-10",
    })
    await tick()
    expect(heading()).toBe("October – November 2026")
    expect(container.querySelectorAll("table").length).toBe(2)
    expect(container.querySelectorAll('[data-value="2026-10-31"]').length).toBe(
      1
    )
    expect(container.querySelectorAll('[data-value="2026-11-01"]').length).toBe(
      1
    )
    day("2026-10-31").focus()
    press("ArrowRight")
    expect(focused()).toBe("2026-11-01")
    expect(heading()).toBe("October – November 2026")
    press("PageDown")
    await tick()
    expect(heading()).toBe("November – December 2026")
    expect(focused()).toBe("2026-12-01")
  })

  test("pressing a day of the next month selects it and turns to it", async () => {
    const { container, instance, heading, focused } = mount({
      defaultMonth: "2026-09",
    })
    await tick()
    const cell = container.querySelector<HTMLElement>(
      '[data-value="2026-10-01"][data-outside]'
    )!
    cell.click()
    expect(instance.api.getValue()).toBe("2026-10-01")
    await tick()
    expect(heading()).toBe("October 2026")
    expect(focused()).toBe("2026-10-01")
  })

  test("a controlled month changes only when the app passes it, and focus follows", async () => {
    const onMonthChange = vi.fn()
    const { instance, day, press, focused } = mount({
      month: "2026-10",
      defaultValue: "2026-10-31",
      onMonthChange,
    })
    await tick()
    day("2026-10-31").focus()
    press("ArrowRight")
    await tick()
    expect(onMonthChange).toHaveBeenCalledWith("2026-11", expect.anything())
    expect(instance.api.getMonth()).toBe("2026-10")
    press("ArrowRight")
    instance.setOptions({
      month: "2026-11",
      defaultValue: "2026-10-31",
      onMonthChange,
      today: "2026-10-16",
    })
    await tick()
    expect(focused()).toBe("2026-11-01")
  })

  test("a controller selects, turns months and focuses dates", async () => {
    const { instance, heading, focused } = mount({ defaultMonth: "2026-10" })
    await tick()
    expect(instance.api.next()).toBe(true)
    await tick()
    expect(heading()).toBe("November 2026")
    instance.api.focus("2027-01-05")
    await tick()
    expect([heading(), focused()]).toEqual(["January 2027", "2027-01-05"])
    instance.api.setValue("2027-01-07")
    expect(instance.api.getValue()).toBe("2027-01-07")
  })

  test("a controller can't select a date people can't pick", () => {
    const { instance } = mount({
      min: "2026-10-05",
      unavailable: ["2026-10-24"],
    })
    expect(instance.api.setValue("2026-10-01")).toBe(false)
    expect(instance.api.setValue("2026-10-24")).toBe(false)
    expect(instance.api.getValue()).toBeNull()
    expect(instance.api.setValue("2026-10-23")).toBe(true)
  })

  test("a controller can't select text that isn't a date, and the value stays", () => {
    const changes: unknown[] = []
    const { instance } = mount({
      defaultValue: "2026-10-20",
      onValueChange: (value) => changes.push(value),
    })
    for (const text of ["25/12/2026", "2026-02-30", "tomorrow"]) {
      expect(instance.api.setValue(text as never)).toBe(false)
    }
    expect([instance.api.getValue(), changes]).toEqual(["2026-10-20", []])
    expect(instance.api.setValue(null)).toBe(true)

    const range = mount({
      mode: "range",
      defaultValue: ["2026-10-20", "2026-10-22"],
    }).instance
    expect(range.api.setValue(["2026-10-21"] as never)).toBe(false)
    expect(range.api.getValue()).toEqual(["2026-10-20", "2026-10-22"])

    const multiple = mount({
      mode: "multiple",
      defaultValue: ["2026-10-20"],
    }).instance
    expect(multiple.api.setValue(["2026-10-21", "soon"] as never)).toBe(false)
    expect(multiple.api.getValue()).toEqual(["2026-10-20"])
    expect(multiple.api.setValue([])).toBe(true)
  })

  test("a controller can't select on a disabled or read-only calendar", () => {
    for (const locked of [{ disabled: true }, { readOnly: true }]) {
      const { instance } = mount(locked)
      expect(instance.api.setValue("2026-10-20")).toBe(false)
      expect(instance.api.getValue()).toBeNull()
      document.body.replaceChildren()
    }
  })

  test("disabled leaves no tab stop and picks nothing; read only focuses but picks nothing", async () => {
    const disabled = mount({ disabled: true })
    expect(disabled.stops()).toEqual([])
    disabled.day("2026-10-20").click()
    expect(disabled.instance.api.getValue()).toBeNull()
    document.body.replaceChildren()
    const readOnly = mount({ readOnly: true })
    await tick()
    readOnly.day("2026-10-20").click()
    expect(readOnly.instance.api.getValue()).toBeNull()
    expect(readOnly.stops()).toEqual(["2026-10-16"])
  })

  test("a value of the wrong shape for its mode reads as nothing selected", () => {
    expect(
      mount({
        mode: "range",
        defaultValue: "2026-10-16",
      }).instance.api.getValue()
    ).toBeNull()
    document.body.replaceChildren()
    expect(
      mount({
        mode: "multiple",
        defaultValue: "2026-10-16",
      }).instance.api.getValue()
    ).toEqual(["2026-10-16"])
  })

  test("days hear only the changes that can affect them", async () => {
    const instance = calendar({
      id: "n",
      mode: "range",
      defaultMonth: "2026-10",
      today: "2026-10-16",
    }) as ReturnType<typeof calendar> & PrimitiveInstance
    const days: Part[] = [
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-30",
    ].map((value) => ({
      slot: "day",
      props: { value },
    }))
    const store = (
      instance as unknown as {
        api: { internal: { roving: { remember: (key: string) => void } } }
      }
    ).api.internal.roving
    const heard = await expectNoMissedUpdates(instance, days, [
      ["move the stop", () => store.remember("2026-10-16")],
      ["move it again", () => store.remember("2026-10-17")],
      [
        "select a range",
        () => instance.api.setValue(["2026-10-15", "2026-10-17"]),
      ],
      ["turn the month", () => instance.api.next()],
    ])
    expect(heard["move it again"]).toBe(2)
  })

  test("the month and year selects offer the months and years, with those past min and max disabled", () => {
    const instance = calendar({
      id: "m",
      defaultMonth: "2026-10",
      min: "2024-03-10",
      max: "2026-11-02",
    }) as PrimitiveInstance
    const month = partState(
      instance.part("month-select")
    ) as CalendarSelectState
    expect(month.value).toBe(10)
    expect(month.options.map((option) => option.label).slice(0, 2)).toEqual([
      "January",
      "February",
    ])
    expect(
      month.options
        .filter((option) => option.disabled)
        .map((option) => option.value)
    ).toEqual([12])
    const year = partState(instance.part("year-select")) as CalendarSelectState
    expect(year.value).toBe(2026)
    expect(year.options.map((option) => option.value)).toEqual([
      2024, 2025, 2026,
    ])
    expect(attrs(instance.part("year-select"))).toMatchObject({
      value: "2026",
      "aria-label": "Year",
    })
    // Without min and max, the years run 10 either side of the year shown.
    const open = calendar({
      id: "o",
      defaultMonth: "1990-06",
    }) as PrimitiveInstance
    const years = (partState(open.part("year-select")) as CalendarSelectState)
      .options
    expect([years[0].value, years.at(-1)!.value]).toEqual([1980, 2000])
  })

  test("the year select labels a year below 100 as that year", () => {
    const instance = calendar({
      id: "e",
      defaultMonth: "0050-06",
      locale: "en-US",
    }) as PrimitiveInstance
    const year = partState(instance.part("year-select")) as CalendarSelectState
    expect(year.options.find((option) => option.value === 50)?.label).toBe("50")
  })

  test("picking a month or a year turns the calendar there, kept between min and max", async () => {
    const onMonthChange = vi.fn()
    const { instance, heading } = mount({
      defaultMonth: "2026-10",
      max: "2027-03-31",
      onMonthChange,
    })
    const pick = (slot: "month-select" | "year-select", value: string) => {
      const select = document.createElement("select")
      for (const option of (
        partState(instance.part(slot)) as CalendarSelectState
      ).options) {
        select.append(new Option(option.label, String(option.value)))
      }
      document.body.append(select)
      const unbind = bind(instance.part(slot), select)
      select.value = value
      select.dispatchEvent(new Event("change", { bubbles: true }))
      unbind()
      select.remove()
    }
    pick("month-select", "2")
    await tick()
    expect(heading()).toBe("February 2026")
    expect(onMonthChange).toHaveBeenLastCalledWith(
      "2026-02",
      expect.objectContaining({ reason: "select-change" })
    )
    pick("year-select", "2027")
    await tick()
    expect(heading()).toBe("February 2027")
    pick("month-select", "8")
    await tick()
    // August 2027 is past max, so it stops at March.
    expect(heading()).toBe("March 2027")
  })
})

test("months that aren't a finite number show one month", () => {
  for (const months of [Infinity, Number.NaN, -2]) {
    expect(
      (calendar({ id: "c", months }) as unknown as PrimitiveInstance).get()
    ).toMatchObject({ months: 1 })
  }
})
