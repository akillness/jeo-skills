// @vitest-environment jsdom
// A name or typing hint written on a part's element replaces the
// part's own, and the attributes its behavior reads stay the part's.
import { expect, test } from "vitest"
import { defineCalendarElements } from "../src/calendar"
import { defineComboboxElements } from "../src/combobox"
import { defineFieldElements } from "../src/field"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("a calendar's Previous keeps the label written on its button, and Next gets its own", async () => {
  defineCalendarElements()
  document.body.innerHTML = `<ui-calendar month="2026-10"><ui-calendar-previous><button aria-label="Mois précédent">‹</button></ui-calendar-previous><ui-calendar-next><button>›</button></ui-calendar-next><ui-calendar-grid></ui-calendar-grid></ui-calendar>`
  await wait()
  const [previous, next] = document.querySelectorAll("button")
  expect(previous.getAttribute("aria-label")).toBe("Mois précédent")
  expect(next.getAttribute("aria-label")).toBe("Next month")
  next.click()
  await wait()
  expect(previous.getAttribute("aria-label")).toBe("Mois précédent")
})

test("a label written on a part's button after it upgrades stays", async () => {
  defineCalendarElements()
  document.body.innerHTML = `<ui-calendar month="2026-10"><ui-calendar-previous><button>‹</button></ui-calendar-previous><ui-calendar-next><button>›</button></ui-calendar-next><ui-calendar-grid></ui-calendar-grid></ui-calendar>`
  await wait()
  const [previous, next] = document.querySelectorAll("button")
  previous.setAttribute("aria-label", "Mois précédent")
  next.click()
  await wait()
  expect(previous.getAttribute("aria-label")).toBe("Mois précédent")
})

test("a copied calendar's grid label follows its month", async () => {
  defineCalendarElements()
  document.body.innerHTML = `<ui-calendar month="2026-10"><ui-calendar-next><button>›</button></ui-calendar-next><ui-calendar-grid></ui-calendar-grid></ui-calendar>`
  await wait()
  const copy = document
    .querySelector("ui-calendar")!
    .cloneNode(true) as HTMLElement
  document.body.replaceChildren(copy)
  await wait()
  copy.querySelector("button")!.click()
  await wait()
  expect(copy.querySelector('[role="grid"]')!.getAttribute("aria-label")).toBe(
    "November 2026"
  )
})

test("a combobox input keeps the autocomplete written on it, and its role", async () => {
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineComboboxElements()
  document.body.innerHTML = `<ui-combobox><ui-combobox-input><input autocomplete="email" role="textbox"></ui-combobox-input></ui-combobox>`
  await wait()
  const input = document.querySelector("input")!
  expect(input.getAttribute("autocomplete")).toBe("email")
  expect(input.getAttribute("role")).toBe("combobox")
})

test("a combobox input inside a labelled field keeps the label reference written on it", async () => {
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineFieldElements()
  defineComboboxElements()
  document.body.innerHTML = `<ui-field><ui-field-label>Fruit</ui-field-label><ui-combobox><ui-combobox-label>Pick one</ui-combobox-label><ui-combobox-input><input aria-labelledby="mine"></ui-combobox-input></ui-combobox></ui-field>`
  await wait()
  expect(document.querySelector("input")!.getAttribute("aria-labelledby")).toBe(
    "mine"
  )
})
