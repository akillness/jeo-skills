// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, test } from "vitest"
import { defineCalendarElements } from "../src/calendar"
import { defineDatePickerElements } from "../src/date-picker"
import { defineFieldElements } from "../src/field"
import { defineNumberInputElements } from "../src/number-input"

const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

// jsdom builds no FormData from form-associated elements, so the entries are
// the ones the browser would build from each element's form value.
const formValues = new Map<HTMLElement, unknown>()
const problems = new Map<HTMLElement, string[]>()
const { setFormValue, setValidity } = ElementInternals.prototype
const owners = new WeakMap<ElementInternals, HTMLElement>()
const { attachInternals } = HTMLElement.prototype

beforeAll(() => {
  Element.prototype.getAnimations ??= () => []
  HTMLElement.prototype.attachInternals = function () {
    const internals = attachInternals.call(this)
    owners.set(internals, this)
    return internals
  }
  ElementInternals.prototype.setFormValue = function (value) {
    formValues.set(owners.get(this)!, value)
  }
  ElementInternals.prototype.setValidity = function (flags = {}) {
    problems.set(
      owners.get(this)!,
      Object.keys(flags).filter(
        (flag) => flags[flag as keyof ValidityStateFlags]
      )
    )
  }
  defineFieldElements()
  defineNumberInputElements()
  defineCalendarElements()
  defineDatePickerElements()
})

afterAll(() => {
  HTMLElement.prototype.attachInternals = attachInternals
  ElementInternals.prototype.setFormValue = setFormValue
  ElementInternals.prototype.setValidity = setValidity
})

afterEach(() => document.body.replaceChildren())

function submitted(el: HTMLElement) {
  const value = formValues.get(el)
  if (value instanceof FormData) {
    return [...value.entries()]
  }
  return value === null || value === undefined
    ? []
    : [[el.getAttribute("name"), value]]
}

const components = {
  "number input": {
    tag: "ui-number-input",
    markup: `
      <ui-number-input name="quantity" default-value="2" required>
        <ui-number-input-decrement><button aria-label="Decrease">−</button></ui-number-input-decrement>
        <ui-number-input-control><input aria-label="Quantity" /></ui-number-input-control>
        <ui-number-input-increment><button aria-label="Increase">+</button></ui-number-input-increment>
      </ui-number-input>`,
    controls: "input, button",
    entries: [["quantity", "2"]],
  },
  "date picker": {
    tag: "ui-date-picker",
    markup: `<ui-date-picker name="due" default-value="2026-03-14" required></ui-date-picker>`,
    // The calendar's own buttons stay focusable while disabled, like a disabled calendar's.
    controls: "input, [data-slot=date-picker-trigger]",
    entries: [["due", "2026-03-14"]],
  },
}

for (const [name, { tag, markup, controls, entries }] of Object.entries(
  components
)) {
  async function mount(html: string) {
    document.body.innerHTML = html
    await wait()
    const el = document.querySelector<HTMLElement>(tag)!
    const disabled = () =>
      [...el.querySelectorAll<HTMLButtonElement>(controls)].map(
        (control) => control.disabled
      )
    return { el, disabled }
  }

  test(`a disabled field disables the whole ${name} inside it, which then submits and requires nothing`, async () => {
    const { el, disabled } = await mount(
      `<ui-field disabled><ui-field-label>Value</ui-field-label>${markup}</ui-field>`
    )
    const field = document.querySelector("ui-field")!
    expect(disabled().length).toBeGreaterThan(1)
    expect(disabled().every(Boolean)).toBe(true)
    expect(el.hasAttribute("data-disabled")).toBe(true)
    expect(submitted(el)).toEqual([])
    expect(problems.get(el)).toEqual([])
    expect(el.querySelector("input")!.willValidate).toBe(false)

    field.removeAttribute("disabled")
    await wait()
    expect(disabled().some(Boolean)).toBe(false)
    expect(el.hasAttribute("data-disabled")).toBe(false)
    expect(submitted(el)).toEqual(entries)

    field.setAttribute("disabled", "")
    await wait()
    expect(disabled().every(Boolean)).toBe(true)
    expect(submitted(el)).toEqual([])
  })

  test(`a ${name} moved out of a disabled field and back follows it`, async () => {
    const { el, disabled } = await mount(
      `<ui-field id="disabled" disabled>${markup}</ui-field><ui-field id="enabled"></ui-field>`
    )
    expect(disabled().every(Boolean)).toBe(true)
    expect(submitted(el)).toEqual([])

    document.getElementById("enabled")!.append(el)
    await wait()
    expect(disabled().some(Boolean)).toBe(false)
    expect(submitted(el)).toEqual(entries)

    document.getElementById("disabled")!.append(el)
    await wait()
    expect(disabled().every(Boolean)).toBe(true)
    expect(submitted(el)).toEqual([])
  })
}

test("a date picker a field disables reports no text that isn't a date", async () => {
  document.body.innerHTML = `<ui-field><ui-date-picker name="due"></ui-date-picker></ui-field>`
  await wait()
  const el = document.querySelector<HTMLElement>("ui-date-picker")!
  const input = el.querySelector("input")!
  input.value = "someday"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  await wait()
  expect(problems.get(el)).toEqual(["badInput"])

  document.querySelector("ui-field")!.setAttribute("disabled", "")
  await wait()
  expect(problems.get(el)).toEqual([])
  expect(submitted(el)).toEqual([])
})
