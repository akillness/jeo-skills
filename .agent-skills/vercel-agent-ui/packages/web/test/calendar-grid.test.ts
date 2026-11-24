// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { defineCalendarElements } from "../src/calendar"
import { defineDatePickerElements } from "../src/date-picker"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

Element.prototype.getAnimations ??= () => []
ElementInternals.prototype.setFormValue ??= () => {}
ElementInternals.prototype.setValidity ??= () => {}

afterEach(() => document.body.replaceChildren())

// A grid whose weekdays and weeks sit inside a wrapper, as a styled layout may put them.
const grid = (offset: number) =>
  `<ui-calendar-grid offset="${offset}"><div><ui-calendar-weekdays></ui-calendar-weekdays><ui-calendar-weeks></ui-calendar-weeks></div></ui-calendar-grid>`

const owners = {
  calendar: (offset: number) =>
    `<ui-calendar month="2026-10">${grid(offset)}</ui-calendar>`,
  "date picker": (offset: number) =>
    `<ui-date-picker month="2026-10" open><ui-date-picker-content>${grid(offset)}</ui-date-picker-content></ui-date-picker>`,
}

const days = () =>
  [...document.querySelectorAll("ui-calendar-day")].map((day) =>
    day.getAttribute("data-value")
  )

for (const [name, markup] of Object.entries(owners)) {
  test(`a ${name} grid's new offset shows its month through a wrapper`, async () => {
    defineCalendarElements()
    defineDatePickerElements()
    document.body.innerHTML = markup(1)
    await wait()
    const expected = days()
    expect(expected).toContain("2026-11-15")
    document.body.innerHTML = markup(0)
    await wait()
    expect(days()).not.toContain("2026-11-15")
    document.querySelector("ui-calendar-grid")!.setAttribute("offset", "1")
    await wait()
    expect(days()).toEqual(expected)
  })
}
