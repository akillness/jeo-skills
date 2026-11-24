// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import {
  defineDateInputElements,
  defineTimeInputElements,
} from "../src/date-input"
import type { UiDateInputElement, UiTimeInputElement } from "../src/events"

const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

afterEach(() => document.body.replaceChildren())

function mount(markup: string) {
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineDateInputElements()
  defineTimeInputElements()
  document.body.innerHTML = markup
}

const segment = (type: string) =>
  document.querySelector<HTMLInputElement>(`input[data-type="${type}"]`)!

async function type(text: string) {
  for (const char of text) {
    document.activeElement!.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: true,
      })
    )
    await wait()
  }
}

test("renders a segment for each unit the locale shows, in its order", async () => {
  mount(`<ui-date-input value="2026-11-02" locale="en-GB"></ui-date-input>`)
  await wait()
  const root = document.querySelector("ui-date-input")!
  const parts = [...root.querySelectorAll("ui-date-input-segment")]
  expect(parts.map((part) => part.getAttribute("segment"))).toEqual([
    "day",
    "literal-0",
    "month",
    "literal-1",
    "year",
  ])
  expect(
    parts.map((part) => part.querySelector("input")?.value ?? part.textContent)
  ).toEqual(["02", "/", "11", "/", "2026"])
  expect(root.getAttribute("role")).toBe("group")
})

test("typing reports the ISO value through valuechange and the value property", async () => {
  mount(`<ui-date-input locale="en-US"></ui-date-input>`)
  await wait()
  const root = document.querySelector<UiDateInputElement>("ui-date-input")!
  const changes = vi.fn()
  root.addEventListener("valuechange", (event) =>
    changes((event as CustomEvent).detail.value)
  )
  segment("month").focus()
  await type("11042026")
  expect(changes.mock.calls.map(([value]) => value)).toEqual(["2026-11-04"])
  expect(root.value).toBe("2026-11-04")
})

test("setting the value property updates the segments", async () => {
  mount(
    `<ui-time-input value="09:30" hour-cycle="24" locale="en-US"></ui-time-input>`
  )
  await wait()
  const root = document.querySelector<UiTimeInputElement>("ui-time-input")!
  root.value = "14:05"
  await wait()
  expect([segment("hour").value, segment("minute").value]).toEqual(["14", "05"])
})

test("a new granularity renders its segments again", async () => {
  mount(`<ui-date-input value="2026-11-02" locale="en-US"></ui-date-input>`)
  await wait()
  const root = document.querySelector("ui-date-input")!
  root.setAttribute("granularity", "minute")
  await wait()
  expect(segment("hour")).toBeTruthy()
  expect(segment("minute")).toBeTruthy()
})

test("writing the value back from valuechange keeps a partly typed date", async () => {
  mount(`<ui-date-input value="2026-11-02" locale="en-US"></ui-date-input>`)
  await wait()
  const root = document.querySelector<UiDateInputElement>("ui-date-input")!
  root.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent).detail
    queueMicrotask(() => (root.value = value))
  })
  segment("day").focus()
  document.activeElement!.dispatchEvent(
    new InputEvent("beforeinput", {
      inputType: "deleteContentForward",
      bubbles: true,
      cancelable: true,
    })
  )
  await wait()
  expect([
    segment("month").value,
    segment("day").value,
    segment("year").value,
  ]).toEqual(["11", "", "2026"])
})

test("a read-only input is barred from validation, like a native one", async () => {
  const setValidity = vi.fn()
  ElementInternals.prototype.setValidity = setValidity
  mount(
    `<form><ui-date-input name="date" required read-only locale="en-US"></ui-date-input></form>`
  )
  await wait()
  const flags = setValidity.mock.calls.at(-1)?.[0] ?? {}
  expect(Object.values(flags).some(Boolean)).toBe(false)
})

test("clear() empties a partly typed date, and an empty string clears the value", async () => {
  mount(`<ui-date-input value="2026-11-02" locale="en-US"></ui-date-input>`)
  await wait()
  const root = document.querySelector<UiDateInputElement>("ui-date-input")!
  segment("day").focus()
  document.activeElement!.dispatchEvent(
    new InputEvent("beforeinput", {
      inputType: "deleteContentForward",
      bubbles: true,
      cancelable: true,
    })
  )
  await wait()
  root.value = null
  await wait()
  expect([
    segment("month").value,
    segment("day").value,
    segment("year").value,
  ]).toEqual(["11", "", "2026"])
  root.api.clear()
  await wait()
  expect([
    segment("month").value,
    segment("day").value,
    segment("year").value,
  ]).toEqual(["", "", ""])
  root.value = "2026-11-02"
  await wait()
  root.value = "" as never
  await wait()
  expect(root.value).toBe(null)
  expect(segment("month").value).toBe("")
})
