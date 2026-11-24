import { expect, test } from "vitest"
import { checkbox, checkboxGroup } from "../src/components/checkbox/checkbox"
import { numberInput } from "../src/components/number-input/number-input"
import { radioGroup } from "../src/components/radio/radio"
import { slider } from "../src/components/slider/slider"
import { attrs } from "../src/foundation/kernel/part"

const checkboxControl = checkbox({ id: "c" })
const checkboxGroupControl = checkboxGroup({ id: "g" })
const radioGroupControl = radioGroup({ id: "r" })
const numberInputControl = numberInput({ id: "n" })
const sliderControl = slider({ id: "s" })

// `setFormDisabled` is how a disabled fieldset around a control reaches it.
test.each([
  ["Checkbox", checkboxControl.api, () => checkboxControl.part("root")],
  [
    "Checkbox Group",
    checkboxGroupControl.api,
    () => checkboxGroupControl.part("group"),
  ],
  ["Radio Group", radioGroupControl.api, () => radioGroupControl.part("group")],
  [
    "Number Input",
    numberInputControl.api,
    () => numberInputControl.part("root"),
  ],
  ["Slider", sliderControl.api, () => sliderControl.part("root")],
] as const)(
  "a disabled fieldset disables %s, and enabling it enables it again",
  (_, api, part) => {
    api.internal.setFormDisabled(true)
    expect(attrs(part())["data-disabled"]).toBe("")
    api.internal.setFormDisabled(false)
    expect(attrs(part())["data-disabled"]).toBeUndefined()
  }
)
