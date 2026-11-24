import { expect, test, vi } from "vitest"
import { checkboxGroup } from "../src/components/checkbox/checkbox-group"
import { combobox } from "../src/components/combobox/combobox"
import { listbox } from "../src/components/listbox/listbox-root"
import { radioGroup } from "../src/components/radio/radio"
import { select } from "../src/components/select/select"
import { slider } from "../src/components/slider/slider"

const items = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
]

// Each control with a controlled value, the value it holds and a default it
// could return to.
const controls = {
  select: { create: select, value: "a", fallback: "b", extra: { items } },
  combobox: { create: combobox, value: "a", fallback: "b", extra: { items } },
  listbox: { create: listbox, value: "a", fallback: "b", extra: { items } },
  radioGroup: { create: radioGroup, value: "a", fallback: "b", extra: {} },
  slider: { create: slider, value: 30, fallback: 60, extra: {} },
  checkboxGroup: {
    create: checkboxGroup,
    value: ["a"],
    fallback: ["b"],
    extra: {},
  },
}

test.each(Object.keys(controls))(
  "a controlled %s with no default keeps its value on a form reset",
  (name) => {
    const { create, value, extra } = controls[name as keyof typeof controls]
    const onValueChange = vi.fn()
    const instance = (create as unknown as typeof select)({
      id: name,
      ...extra,
      value,
      onValueChange,
    } as never)
    instance.api.internal.reset()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(instance.api.getValue()).toEqual(value)
  }
)

test.each(Object.keys(controls))(
  "a controlled %s with a default returns to it on a form reset",
  (name) => {
    const { create, value, fallback, extra } =
      controls[name as keyof typeof controls]
    const onValueChange = vi.fn()
    const instance = (create as unknown as typeof select)({
      id: name,
      ...extra,
      value,
      defaultValue: fallback,
      onValueChange,
    } as never)
    instance.api.internal.reset()
    expect(onValueChange.mock.calls[0]?.[0]).toEqual(fallback)
  }
)
