import { describe, expect, test, vi } from "vitest"
import { numberInput } from "../src/components/number-input/number-input"
import { inputMode } from "../src/components/number-input/number-input-api"
import { attrs, partState } from "../src/foundation/kernel/part"

describe("number input", () => {
  test("shows its value formatted, and submits the number as is", () => {
    const instance = numberInput({
      id: "n",
      name: "amount",
      defaultValue: 1234.5,
      locale: "en-US",
      format: { style: "currency", currency: "USD" },
    })
    expect(attrs(instance.part("control")).value).toBe("$1,234.50")
    expect(attrs(instance.part("hidden-input"))).toMatchObject({
      name: "amount",
      value: "1234.5",
    })
  })

  test("a button's state tells a value at its bound from a disabled field", () => {
    const atMax = numberInput({ id: "n", defaultValue: 10, max: 10 })
    expect(partState(atMax.part("increment"))).toMatchObject({
      disabled: true,
      atBound: true,
    })
    expect(partState(atMax.part("decrement"))).toMatchObject({
      disabled: false,
      atBound: false,
    })
    const disabled = numberInput({
      id: "n",
      defaultValue: 5,
      max: 10,
      disabled: true,
    })
    expect(partState(disabled.part("increment"))).toMatchObject({
      disabled: true,
      atBound: false,
    })
    expect(attrs(atMax.part("increment", { id: "n" }))["data-at-bound"]).toBe(
      ""
    )
    expect(
      attrs(atMax.part("decrement", { id: "n" }))["data-at-bound"]
    ).toBeUndefined()
    expect(
      attrs(disabled.part("increment", { id: "n" }))["data-at-bound"]
    ).toBeUndefined()
  })

  test("End and the increment button stop at the highest value on the step grid", () => {
    const instance = numberInput({
      id: "n",
      defaultValue: 3,
      min: 0,
      max: 10,
      step: 3,
    })
    instance.api.internal.keydown({
      key: "End",
      preventDefault() {},
    } as KeyboardEvent)
    expect(instance.get().value).toBe(9)
    expect(partState(instance.part("increment"))).toMatchObject({
      disabled: true,
      atBound: true,
    })
    instance.api.internal.keydown({
      key: "ArrowUp",
      altKey: true,
      preventDefault() {},
    } as KeyboardEvent)
    expect(instance.get().value).toBe(9.3)
  })

  test("the default small step has no floating point noise", () => {
    const instance = numberInput({ id: "n", defaultValue: 1, step: 0.7 })
    instance.api.internal.keydown({
      key: "ArrowUp",
      altKey: true,
      preventDefault() {},
    } as KeyboardEvent)
    expect(instance.get().value).toBe(1.05)
  })

  test("a disabled button is disabled on its own, even in a read-only field", () => {
    const instance = numberInput({ id: "n", defaultValue: 5 })
    expect(
      partState(instance.part("increment", { disabled: true }))
    ).toMatchObject({ disabled: true })
    expect(attrs(instance.part("increment", { disabled: true }))).toMatchObject(
      {
        disabled: "",
        "aria-disabled": "true",
        "data-disabled": "",
      }
    )
    expect(attrs(instance.part("decrement"))["data-disabled"]).toBeUndefined()
    const readOnly = numberInput({ id: "n", defaultValue: 5, readOnly: true })
    expect(attrs(readOnly.part("increment")).disabled).toBeUndefined()
    expect(attrs(readOnly.part("increment", { disabled: true })).disabled).toBe(
      ""
    )
  })

  test("a new format shows the value again", () => {
    const options = { id: "n", defaultValue: 19.99, locale: "en-US" }
    const instance = numberInput(options)
    expect(attrs(instance.part("control")).value).toBe("19.99")
    instance.setOptions({
      ...options,
      format: { style: "currency", currency: "USD" },
    })
    expect(attrs(instance.part("control")).value).toBe("$19.99")
  })

  test("typing follows the value only while it's a number within the bounds", () => {
    const onValueChange = vi.fn()
    const instance = numberInput({
      id: "n",
      defaultValue: 5,
      min: 1,
      max: 10,
      locale: "en-US",
      onValueChange,
    })
    instance.api.internal.type("7")
    instance.api.internal.type("70")
    expect(instance.get().value).toBe(7)
    instance.api.internal.commitText()
    expect(instance.get().value).toBe(10)
    expect(attrs(instance.part("control")).value).toBe("10")
    expect(
      onValueChange.mock.calls.map(([value, details]) => [
        value,
        details.reason,
      ])
    ).toEqual([
      [7, "input-change"],
      [10, "input-commit"],
    ])
  })

  test("text shown with the step's decimals reads back, like a currency by name", () => {
    const instance = numberInput({
      id: "n",
      defaultValue: 1.5,
      step: 0.01,
      locale: "ru",
      format: { style: "currency", currency: "JPY", currencyDisplay: "name" },
    })
    const shown = attrs(instance.part("control")).value as string
    instance.api.internal.type(shown)
    instance.api.internal.commitText()
    expect(instance.get().value).toBe(1.5)
    instance.api.internal.type(shown.replace("1,5", "2,5"))
    expect(instance.get().value).toBe(2.5)
  })

  test("a percent without a step keeps a typed percent and steps by one percent", () => {
    const instance = numberInput({
      id: "n",
      defaultValue: null,
      locale: "en-US",
      format: { style: "percent" },
    })
    instance.api.internal.type("25%")
    instance.api.internal.commitText()
    expect(instance.get().value).toBe(0.25)
    expect(attrs(instance.part("control")).value).toBe("25%")
    instance.api.internal.keydown({
      key: "ArrowUp",
      preventDefault() {},
    } as KeyboardEvent)
    expect(instance.get().value).toBe(0.26)
    instance.api.decrement()
    instance.api.decrement()
    expect(instance.get().value).toBe(0.24)
    instance.api.internal.keydown({
      key: "PageUp",
      preventDefault() {},
    } as KeyboardEvent)
    expect(instance.get().value).toBe(0.34)
    expect(attrs(instance.part("control")).value).toBe("34%")
  })

  test("a percent with fraction digits keeps a typed percent", () => {
    const instance = numberInput({
      id: "n",
      defaultValue: null,
      locale: "en-US",
      format: { style: "percent", minimumFractionDigits: 2 },
    })
    instance.api.internal.type("3.75%")
    instance.api.internal.commitText()
    expect(instance.get().value).toBe(0.0375)
    expect(attrs(instance.part("control")).value).toBe("3.75%")
  })

  test("steps from empty start at 0, within the bounds", () => {
    const instance = numberInput({ id: "n", defaultValue: null, min: 5 })
    instance.api.increment()
    expect(instance.get().value).toBe(5)
    const open = numberInput({ id: "m", defaultValue: null })
    open.api.decrement()
    expect(open.get().value).toBe(-1)
  })

  test("a commit after a value set from outside reports the user's change back to an earlier value", () => {
    const onValueCommit = vi.fn()
    const instance = numberInput({
      id: "n",
      defaultValue: 4,
      locale: "en-US",
      onValueCommit,
    })
    instance.api.internal.type("6")
    instance.api.internal.commitText()
    instance.api.setValue(4)
    instance.api.internal.type("6")
    instance.api.internal.commitText()
    expect(
      onValueCommit.mock.calls.map(([value, details]) => [
        value,
        details.reason,
      ])
    ).toEqual([
      [6, "input-change"],
      [6, "input-change"],
    ])
  })

  test("a controlled value commits what Enter clamped it to, before its owner passes it back", () => {
    const onValueCommit = vi.fn()
    const options = {
      id: "n",
      value: 4,
      min: 1,
      max: 12,
      locale: "en-US",
      onValueCommit,
    }
    const instance = numberInput(options)
    instance.api.internal.type("2")
    instance.setOptions({ ...options, value: 2 })
    instance.api.internal.type("20")
    instance.api.internal.commitText()
    instance.setOptions({ ...options, value: 12 })
    instance.api.internal.type("0")
    instance.api.internal.commitText()
    expect(
      onValueCommit.mock.calls.map(([value, details]) => [
        value,
        details.reason,
      ])
    ).toEqual([
      [12, "input-commit"],
      [1, "input-commit"],
    ])
  })

  test("an uncontrolled value commits what onValueChange replaced it with", () => {
    const onValueCommit = vi.fn()
    const instance = numberInput({
      id: "n",
      defaultValue: 4,
      min: 1,
      max: 12,
      locale: "en-US",
      onValueChange: (value) => {
        if (value === 12) {
          instance.api.setValue(10)
        }
      },
      onValueCommit,
    })
    instance.api.internal.type("20")
    instance.api.internal.commitText()
    expect(instance.api.getValue()).toBe(10)
    expect(onValueCommit.mock.calls.map(([value]) => value)).toEqual([10])
  })

  test.each([
    ["isn't a number", "-", 5],
    ["is empty", "", 1],
    ["is the value", "4", 5],
  ])(
    "a step keeps its value when onValueChange blurs the field and the text %s",
    (_name, text, stepped) => {
      const instance = numberInput({
        id: "n",
        defaultValue: 4,
        min: -10,
        locale: "en-US",
        onValueChange: (_value, details) => {
          if (details.reason === "step-key") {
            instance.api.internal.commitText()
          }
        },
      })
      instance.api.internal.type(text)
      instance.api.internal.keydown({
        key: "ArrowUp",
        preventDefault() {},
      } as KeyboardEvent)
      expect(instance.api.getValue()).toBe(stepped)
    }
  )

  test("a controller step leaves nothing for the next blur to commit", () => {
    const onValueCommit = vi.fn()
    const instance = numberInput({ id: "n", defaultValue: 1, onValueCommit })
    instance.api.increment()
    instance.api.internal.commitText()
    expect(instance.get().value).toBe(2)
    expect(onValueCommit).not.toHaveBeenCalled()
  })

  test("asks for the keyboard each platform needs", () => {
    const negative = numberInput({ id: "n", step: 0.5 })
    expect(attrs(negative.part("control")).inputmode).toBe("decimal")
    expect(inputMode({ ...negative.get(), platform: "ios" })).toBe("text")
    expect(inputMode({ ...negative.get(), platform: "android" })).toBe(
      "numeric"
    )
    const whole = numberInput({ id: "w", min: 0 })
    expect(attrs(whole.part("control")).inputmode).toBe("numeric")
  })
})
