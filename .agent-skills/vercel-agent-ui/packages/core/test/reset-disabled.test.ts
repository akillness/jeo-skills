import { expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { listbox } from "../src/components/listbox/listbox-root"
import { select } from "../src/components/select/select"

// A form reset reaches a disabled control too, as it does a native one, so a
// section disabled during a reset doesn't come back holding its old value.
const controls = { select, combobox, listbox }
const items = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
]

test.each(Object.keys(controls))(
  "a disabled %s returns to its default on a form reset",
  (name) => {
    const create = controls[
      name as keyof typeof controls
    ] as unknown as typeof select
    for (const disable of [
      (instance: ReturnType<typeof create>) =>
        instance.api.internal.setFormDisabled(true),
      (instance: ReturnType<typeof create>) =>
        instance.setOptions({
          id: name,
          items,
          defaultValue: "b",
          disabled: true,
        }),
    ]) {
      const instance = create({ id: name, items, defaultValue: "b" })
      instance.api.setValue("c")
      expect(instance.api.getValue()).toBe("c")
      disable(instance)
      expect(instance.api.setValue("a")).toBe(false)
      instance.api.internal.reset()
      expect(instance.api.getValue()).toBe("b")
    }
  }
)
