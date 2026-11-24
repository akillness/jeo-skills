// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { checkbox, checkboxGroup } from "../src/components/checkbox/checkbox"
import { combobox } from "../src/components/combobox/combobox"
import { listbox } from "../src/components/listbox/listbox-root"
import { radioGroup } from "../src/components/radio/radio"
import { select } from "../src/components/select/select"
import { switchPrimitive } from "../src/components/switch/switch"
import { attrs } from "../src/foundation/kernel/part"

type Guard = "disabled" | "readOnly" | "formDisabled"
type GuardOptions = { disabled?: boolean; readOnly?: boolean }

const optionsFor = (guard: Guard): GuardOptions =>
  guard === "formDisabled" ? {} : { [guard]: true }

type ListOptions = GuardOptions & { multiple: boolean }

type Restorable = {
  get: () => { value?: unknown; checked?: unknown }
  api: {
    internal: {
      restore: (saved: string) => void
      setFormDisabled: (disabled: boolean) => void
    }
  }
}

const items = ["a", "b"]

const lists = [
  [
    "select",
    (options: ListOptions) => select({ id: "select", items, ...options }),
  ],
  [
    "combobox",
    (options: ListOptions) => combobox({ id: "combobox", items, ...options }),
  ],
  [
    "listbox",
    (options: ListOptions) => listbox({ id: "listbox", items, ...options }),
  ],
] as const

const toggles = [
  [
    "checkbox",
    (options: GuardOptions) => checkbox({ id: "checkbox", ...options }),
  ],
  [
    "switch",
    (options: GuardOptions) => switchPrimitive({ id: "switch", ...options }),
  ],
] as const

function guarded<T extends Restorable>(instance: T, guard: Guard) {
  if (guard === "formDisabled") {
    instance.api.internal.setFormDisabled(true)
  }
  return instance
}

describe("a public write with the reason restore", () => {
  for (const [name, create] of lists) {
    for (const multiple of [false, true]) {
      for (const guard of ["disabled", "readOnly", "formDisabled"] as const) {
        test(`is refused by a ${guard} ${name}, multiple: ${multiple}`, () => {
          const instance = guarded(
            create({ multiple, ...optionsFor(guard) }),
            guard
          )
          instance.api.setValue(multiple ? ["b"] : "b", { reason: "restore" })
          expect(instance.get().value).toEqual(multiple ? [] : null)
        })
      }
    }
  }

  for (const [name, create] of toggles) {
    for (const guard of ["disabled", "readOnly", "formDisabled"] as const) {
      test(`is refused by a ${guard} ${name}`, () => {
        const instance = guarded(create(optionsFor(guard)), guard)
        instance.api.setChecked(true, { reason: "restore" })
        expect(instance.get().checked).toBe(false)
      })
    }
  }

  for (const guard of ["disabled", "readOnly", "formDisabled"] as const) {
    test(`is refused by a ${guard} radio group`, () => {
      const instance = guarded(
        radioGroup({ id: "radio", ...optionsFor(guard) }),
        guard
      )
      attrs(instance.part("root", { value: "a" }))
      instance.api.setValue("a", { reason: "restore" })
      expect(instance.get().value).toBeNull()
    })
  }

  test("is refused for a disabled radio", () => {
    const instance = radioGroup({ id: "radio" })
    attrs(instance.part("root", { value: "a", disabled: true }))
    instance.api.setValue("a", { reason: "restore" })
    expect(instance.get().value).toBeNull()
  })

  for (const guard of ["disabled", "formDisabled"] as const) {
    test(`is refused by a ${guard} checkbox group`, () => {
      const instance = guarded(
        checkboxGroup({ id: "group", ...optionsFor(guard) }),
        guard
      )
      instance.api.setValue(["a"], { reason: "restore" })
      expect(instance.get().value).toEqual([])
    })
  }
})

describe("the browser's restore", () => {
  for (const [name, create] of lists) {
    for (const multiple of [false, true]) {
      for (const guard of ["disabled", "readOnly", "formDisabled"] as const) {
        test(`lands on a ${guard} ${name}, multiple: ${multiple}`, () => {
          const instance = guarded(
            create({ multiple, ...optionsFor(guard) }),
            guard
          )
          instance.api.internal.restore(JSON.stringify(["b"]))
          expect(instance.get().value).toEqual(multiple ? ["b"] : "b")
        })
      }
    }
  }

  for (const [name, create] of lists) {
    test(`of a value that isn't a list of keys selects nothing in a ${name}`, () => {
      const instance = create({ multiple: false })
      for (const saved of ["5", "null", "{}"]) {
        instance.api.internal.restore(saved)
        expect(instance.get().value).toBeNull()
      }
    })
  }

  for (const [name, create] of toggles) {
    for (const guard of ["disabled", "readOnly", "formDisabled"] as const) {
      test(`lands on a ${guard} ${name}`, () => {
        const instance = guarded(create(optionsFor(guard)), guard)
        instance.api.internal.restore("true")
        expect(instance.get().checked).toBe(true)
      })
    }
  }

  for (const guard of ["disabled", "readOnly", "formDisabled"] as const) {
    test(`lands on a ${guard} radio group`, () => {
      const instance = guarded(
        radioGroup({ id: "radio", ...optionsFor(guard) }),
        guard
      )
      attrs(instance.part("root", { value: "a" }))
      instance.api.internal.restore("a")
      expect(instance.get().value).toBe("a")
    })
  }

  for (const guard of ["disabled", "formDisabled"] as const) {
    test(`lands on a ${guard} checkbox group`, () => {
      const instance = guarded(
        checkboxGroup({ id: "group", ...optionsFor(guard) }),
        guard
      )
      instance.api.internal.restore("a")
      expect(instance.get().value).toEqual(["a"])
    })
  }
})
