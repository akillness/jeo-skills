// @vitest-environment jsdom
// A form state the browser restores before an element's parts bind waits for
// them, but anything newer that sets the state first wins.
import { beforeAll, expect, test, vi } from "vitest"
import {
  defineCheckboxElements,
  defineCheckboxGroupElements,
  defineSwitchElements,
} from "../src/checkbox"
import { defineComboboxElements } from "../src/combobox"
import { defineDatePickerElements } from "../src/date-picker"
import { defineListboxElements } from "../src/listbox"
import { defineNumberInputElements } from "../src/number-input"
import { defineRadioGroupElements } from "../src/radio"
import { defineSelectElements } from "../src/select"
import { defineSliderElements } from "../src/slider"
import { defineTokenInputElements } from "../src/token-input"

;(Element.prototype as { getAnimations?: () => Animation[] }).getAnimations ??=
  () => []
ElementInternals.prototype.setFormValue ??= () => {}
ElementInternals.prototype.setValidity ??= () => {}

beforeAll(() => {
  defineCheckboxElements()
  defineCheckboxGroupElements()
  defineSwitchElements()
  defineComboboxElements()
  defineDatePickerElements()
  defineListboxElements()
  defineNumberInputElements()
  defineRadioGroupElements()
  defineSelectElements()
  defineSliderElements()
  defineTokenInputElements()
})

// The callback the browser calls as it restores a form, which the element types leave out.
type FormRestore = {
  formStateRestoreCallback: (state: unknown, mode: string) => void
}

const restoreForm = (el: Element, state: string) =>
  (el as Element & FormRestore).formStateRestoreCallback(state, "restore")

// Parts bind a microtask after the element connects, and a waiting restore
// lands right after, so once the root's slot is written both have run.
const bound = (el: Element) =>
  vi.waitFor(() => expect(el.getAttribute("data-slot")).not.toBeNull())

function insert<K extends keyof HTMLElementTagNameMap>(tag: K, markup: string) {
  document.body.innerHTML = `<form>${markup}</form>`
  return document.querySelector(tag)!
}

const checkbox = () =>
  insert(
    "ui-checkbox",
    `<ui-checkbox name="gift"><button>Gift wrap</button></ui-checkbox>`
  )

test("a restore before the parts bind lands once they do", async () => {
  const box = checkbox()
  restoreForm(box, "true")
  await bound(box)
  expect(box.checked).toBe(true)
})

test("a script write after a waiting restore wins", async () => {
  const box = checkbox()
  restoreForm(box, "true")
  box.checked = false
  await bound(box)
  expect(box.checked).toBe(false)
})

test("a state attribute written after a waiting restore wins", async () => {
  const box = checkbox()
  restoreForm(box, "true")
  box.setAttribute("checked", "false")
  await bound(box)
  expect(box.checked).toBe(false)
})

test("a newer restore wins over an older one still waiting", async () => {
  const box = checkbox()
  restoreForm(box, "true")
  restoreForm(box, "false")
  await bound(box)
  expect(box.checked).toBe(false)
})

const families = [
  {
    name: "checkbox",
    insert: checkbox,
    saved: "true",
    write: () => document.querySelector("ui-checkbox")!.api.setChecked(false),
    read: () => document.querySelector("ui-checkbox")!.checked,
    expected: false,
  },
  {
    name: "switch",
    insert: () =>
      insert(
        "ui-switch",
        `<ui-switch name="wifi"><button>Wi-Fi</button></ui-switch>`
      ),
    saved: "true",
    write: () => document.querySelector("ui-switch")!.api.setChecked(false),
    read: () => document.querySelector("ui-switch")!.checked,
    expected: false,
  },
  {
    name: "checkbox group",
    insert: () =>
      insert(
        "ui-checkbox-group",
        `<ui-checkbox-group name="toppings"><ui-checkbox value="cheese"><button>Cheese</button></ui-checkbox><ui-checkbox value="olives"><button>Olives</button></ui-checkbox></ui-checkbox-group>`
      ),
    saved: "cheese",
    write: () =>
      document.querySelector("ui-checkbox-group")!.api.setValue(["olives"]),
    read: () => document.querySelector("ui-checkbox-group")!.value,
    expected: ["olives"],
  },
  {
    name: "radio group",
    insert: () =>
      insert(
        "ui-radio-group",
        `<ui-radio-group name="plan"><ui-radio value="free"><button>Free</button></ui-radio><ui-radio value="pro"><button>Pro</button></ui-radio></ui-radio-group>`
      ),
    saved: "free",
    write: () => document.querySelector("ui-radio-group")!.api.setValue("pro"),
    read: () => document.querySelector("ui-radio-group")!.value,
    expected: "pro",
  },
  {
    name: "select",
    insert: () =>
      insert(
        "ui-select",
        `<ui-select name="size"><ui-select-trigger><button aria-label="Size"></button></ui-select-trigger></ui-select>`
      ),
    saved: JSON.stringify(["small"]),
    write: () => document.querySelector("ui-select")!.api.setValue("large"),
    read: () => document.querySelector("ui-select")!.value,
    expected: "large",
  },
  {
    name: "combobox",
    insert: () =>
      insert(
        "ui-combobox",
        `<ui-combobox name="country"><ui-combobox-input><input aria-label="Country" /></ui-combobox-input></ui-combobox>`
      ),
    saved: JSON.stringify(["chile"]),
    write: () => document.querySelector("ui-combobox")!.api.setValue("peru"),
    read: () => document.querySelector("ui-combobox")!.value,
    expected: "peru",
  },
  {
    name: "listbox",
    insert: () =>
      insert(
        "ui-listbox",
        `<ui-listbox name="fruit" aria-label="Fruit"><ui-listbox-item value="apple">Apple</ui-listbox-item><ui-listbox-item value="pear">Pear</ui-listbox-item></ui-listbox>`
      ),
    saved: JSON.stringify(["apple"]),
    write: () => document.querySelector("ui-listbox")!.api.setValue("pear"),
    read: () => document.querySelector("ui-listbox")!.value,
    expected: "pear",
  },
  {
    name: "slider",
    insert: () =>
      insert(
        "ui-slider",
        `<ui-slider name="volume"><ui-slider-control><ui-slider-track><ui-slider-thumb></ui-slider-thumb></ui-slider-track></ui-slider-control></ui-slider>`
      ),
    saved: "20",
    write: () => document.querySelector("ui-slider")!.api.setValue(60),
    read: () => document.querySelector("ui-slider")!.value,
    expected: 60,
  },
  {
    name: "number input",
    insert: () =>
      insert(
        "ui-number-input",
        `<ui-number-input name="quantity"><ui-number-input-control><input aria-label="Quantity" /></ui-number-input-control></ui-number-input>`
      ),
    saved: "2",
    write: () => document.querySelector("ui-number-input")!.api.setValue(5),
    read: () => document.querySelector("ui-number-input")!.value,
    expected: 5,
  },
  {
    name: "token input",
    insert: () =>
      insert(
        "ui-token-input",
        `<ui-token-input name="prompt"><ui-token-input-editor aria-label="Prompt"></ui-token-input-editor></ui-token-input>`
      ),
    saved: "saved",
    write: () =>
      document.querySelector("ui-token-input")!.api.setValue(["typed"]),
    read: () => document.querySelector("ui-token-input")!.value,
    expected: ["typed"],
  },
  {
    name: "date picker",
    insert: () =>
      insert(
        "ui-date-picker",
        `<ui-date-picker name="due"><ui-date-picker-input><input aria-label="Due date" /></ui-date-picker-input></ui-date-picker>`
      ),
    saved: JSON.stringify("2024-05-01"),
    write: () =>
      document.querySelector("ui-date-picker")!.api.setValue("2024-06-01"),
    read: () => document.querySelector("ui-date-picker")!.value,
    expected: "2024-06-01",
  },
]

for (const { name, insert, saved, write, read, expected } of families) {
  test(`the ${name} api's write right after a waiting restore wins`, async () => {
    const el = insert()
    restoreForm(el, saved)
    write()
    await bound(el)
    expect(read()).toEqual(expected)
  })
}

test("a checkbox written after its group's restore started waiting wins", async () => {
  const group = insert(
    "ui-checkbox-group",
    `<ui-checkbox-group name="toppings"><ui-checkbox value="cheese"><button>Cheese</button></ui-checkbox><ui-checkbox value="olives"><button>Olives</button></ui-checkbox></ui-checkbox-group>`
  )
  restoreForm(group, "cheese")
  document.querySelector<HTMLElementTagNameMap["ui-checkbox"]>(
    "ui-checkbox[value=olives]"
  )!.checked = true
  await bound(group)
  expect(group.value).toEqual(["olives"])
})

type Pet = { id: number }
const pets = [
  { value: { id: 1 }, label: "Cat" },
  { value: { id: 2 }, label: "Dog" },
]
const itemToValue = (item: unknown) => String((item as Pet).id)

test("a restore whose items arrive later fires no valuechange", async () => {
  const select = insert(
    "ui-select",
    `<ui-select name="pet"><ui-select-trigger><button aria-label="Pet"></button></ui-select-trigger></ui-select>`
  )
  select.itemToValue = itemToValue
  await bound(select)
  const heard: unknown[] = []
  select.addEventListener("valuechange", (event) =>
    heard.push(event.detail.value)
  )
  restoreForm(select, JSON.stringify(["2"]))
  select.items = pets
  await vi.waitFor(() => expect(select.value).toBe(pets[1]!.value))
  expect(heard).toEqual([])
})

const lists = [
  {
    name: "select",
    insert: (multiple: string) =>
      insert(
        "ui-select",
        `<ui-select name="pet" ${multiple}><ui-select-trigger><button aria-label="Pet"></button></ui-select-trigger></ui-select>`
      ),
  },
  {
    name: "combobox",
    insert: (multiple: string) =>
      insert(
        "ui-combobox",
        `<ui-combobox name="pet" ${multiple}><ui-combobox-input><input aria-label="Pet" /></ui-combobox-input></ui-combobox>`
      ),
  },
  {
    name: "listbox",
    insert: (multiple: string) =>
      insert(
        "ui-listbox",
        `<ui-listbox name="pet" aria-label="Pet" ${multiple}></ui-listbox>`
      ),
  },
]

for (const { name, insert } of lists) {
  for (const multiple of [false, true]) {
    test(`a ${name} put back while its restore waits for items still takes them, multiple: ${multiple}`, async () => {
      const shaped = (value: unknown) => (multiple ? [value] : value)
      const el = insert(multiple ? "multiple" : "")
      el.itemToValue = itemToValue
      await bound(el)
      restoreForm(el, JSON.stringify(["2"]))
      const form = el.parentElement!
      el.remove()
      // It saves its state a microtask after it leaves.
      await Promise.resolve()
      form.append(el)
      await vi.waitFor(() => expect(el.value).toEqual(shaped("2")))
      el.items = pets
      await vi.waitFor(() => expect(el.value).toEqual(shaped(pets[1]!.value)))
    })
  }
}
