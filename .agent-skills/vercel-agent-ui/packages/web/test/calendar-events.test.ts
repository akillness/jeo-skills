// @vitest-environment jsdom
import { expect, test } from "vitest"
import { defineCalendarElements } from "../src/calendar"
import type { UiCalendarElement } from "../src/events"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("focusedchange fires when a day takes focus, not on load or when script sets the month, and cancels", async () => {
  defineCalendarElements()
  document.body.innerHTML = `<ui-calendar month="2026-10"></ui-calendar>`
  const calendar = document.body.firstElementChild as UiCalendarElement
  const heard: (string | null)[] = []
  const cancelable: boolean[] = []
  calendar.addEventListener("focusedchange", (event) => {
    heard.push(event.detail.value)
    cancelable.push(event.cancelable)
  })
  await wait()
  calendar.month = "2026-12"
  await wait()
  expect(heard).toEqual([])
  calendar.querySelector<HTMLElement>('[data-value="2026-12-10"]')!.focus()
  expect(heard).toEqual(["2026-12-10"])
  expect(cancelable).toEqual([true])
  calendar.addEventListener("focusedchange", (event) => event.preventDefault())
  calendar.querySelector<HTMLElement>('[data-value="2026-12-11"]')!.focus()
  expect(document.activeElement!.getAttribute("data-value")).toBe("2026-12-10")
})
