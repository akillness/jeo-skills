// @vitest-environment jsdom
// Only the browser's own restore is quiet. A write from script that gives the
// reason "restore" is an ordinary write, so its event fires and can be canceled.
import { beforeAll, expect, test } from "vitest"
import {
  defineCheckboxElements,
  defineCheckboxGroupElements,
  defineSwitchElements,
} from "../src/checkbox"
import { defineComboboxElements } from "../src/combobox"
import { defineDatePickerElements } from "../src/date-picker"
import { defineListboxElements } from "../src/listbox"
import { defineNumberInputElements } from "../src/number-input"
import { defineOTPInputElements } from "../src/otp-input"
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
  defineOTPInputElements()
  defineRadioGroupElements()
  defineSelectElements()
  defineSliderElements()
  defineTokenInputElements()
})

const restore = { reason: "restore" } as const

const families = [
  {
    name: "checkbox",
    markup: `<ui-checkbox name="gift"><button>Gift</button></ui-checkbox>`,
    event: "checkedchange",
    write: () =>
      document.querySelector("ui-checkbox")!.api.setChecked(true, restore),
  },
  {
    name: "switch",
    markup: `<ui-switch name="wifi"><button>Wi-Fi</button></ui-switch>`,
    event: "checkedchange",
    write: () =>
      document.querySelector("ui-switch")!.api.setChecked(true, restore),
  },
  {
    name: "checkbox group",
    markup: `<ui-checkbox-group name="toppings"><ui-checkbox value="cheese"><button>Cheese</button></ui-checkbox></ui-checkbox-group>`,
    event: "valuechange",
    write: () =>
      document
        .querySelector("ui-checkbox-group")!
        .api.setValue(["cheese"], restore),
  },
  {
    name: "radio group",
    markup: `<ui-radio-group name="plan"><ui-radio value="free"><button>Free</button></ui-radio></ui-radio-group>`,
    event: "valuechange",
    write: () =>
      document.querySelector("ui-radio-group")!.api.setValue("free", restore),
  },
  {
    name: "select",
    markup: `<ui-select name="size"><ui-select-trigger><button aria-label="Size"></button></ui-select-trigger></ui-select>`,
    event: "valuechange",
    write: () =>
      document.querySelector("ui-select")!.api.setValue("large", restore),
  },
  {
    name: "combobox",
    markup: `<ui-combobox name="country"><ui-combobox-input><input aria-label="Country" /></ui-combobox-input></ui-combobox>`,
    event: "valuechange",
    write: () =>
      document.querySelector("ui-combobox")!.api.setValue("peru", restore),
  },
  {
    name: "listbox",
    markup: `<ui-listbox name="fruit" aria-label="Fruit"><ui-listbox-item value="apple">Apple</ui-listbox-item></ui-listbox>`,
    event: "valuechange",
    write: () =>
      document.querySelector("ui-listbox")!.api.setValue("apple", restore),
  },
  {
    name: "slider",
    markup: `<ui-slider name="volume"><ui-slider-control><ui-slider-track><ui-slider-thumb></ui-slider-thumb></ui-slider-track></ui-slider-control></ui-slider>`,
    event: "valuechange",
    write: () => document.querySelector("ui-slider")!.api.setValue(40, restore),
  },
  {
    name: "number input",
    markup: `<ui-number-input name="quantity"><ui-number-input-control><input aria-label="Quantity" /></ui-number-input-control></ui-number-input>`,
    event: "valuechange",
    write: () =>
      document.querySelector("ui-number-input")!.api.setValue(3, restore),
  },
  {
    name: "token input",
    markup: `<ui-token-input name="prompt"><ui-token-input-editor aria-label="Prompt"></ui-token-input-editor></ui-token-input>`,
    event: "valuechange",
    write: () =>
      document
        .querySelector("ui-token-input")!
        .api.setValue(["hello"], restore),
  },
  {
    name: "date picker",
    markup: `<ui-date-picker name="due"><ui-date-picker-input><input aria-label="Due date" /></ui-date-picker-input></ui-date-picker>`,
    event: "valuechange",
    write: () =>
      document
        .querySelector("ui-date-picker")!
        .api.setValue("2024-05-01", restore),
  },
  {
    name: "OTP input",
    markup: `<ui-otp-input name="code" max-length="4" aria-label="Code"></ui-otp-input>`,
    event: "valuechange",
    write: () =>
      document.querySelector("ui-otp-input")!.api.setValue("12", restore),
  },
]

for (const { name, markup, event, write } of families) {
  test(`the ${name} fires its event for a write from script that gives the reason restore`, () => {
    document.body.innerHTML = markup
    const heard: unknown[] = []
    document.body.firstElementChild!.addEventListener(event, (change) =>
      heard.push((change as CustomEvent<{ reason: string }>).detail.reason)
    )
    write()
    expect(heard).toEqual(["restore"])
  })
}

test("a write from script that gives the reason restore can be canceled", () => {
  document.body.innerHTML = `<ui-checkbox name="gift"><button>Gift</button></ui-checkbox>`
  const box = document.querySelector("ui-checkbox")!
  box.addEventListener("checkedchange", (event) => event.preventDefault())
  box.api.setChecked(true, restore)
  expect(box.checked).toBe(false)
})
