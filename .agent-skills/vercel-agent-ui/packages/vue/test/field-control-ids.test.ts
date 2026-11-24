// @vitest-environment jsdom
import { expect, test } from "vitest"
import { createApp, h, nextTick, ref } from "vue"
import { Field, FieldLabel } from "../src/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputIncrement,
} from "../src/number-input"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "../src/password-input"
import { Slider, SliderControl, SliderThumb, SliderTrack } from "../src/slider"

const settle = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

test.each([
  ["number input", "amount"],
  ["password input", "secret"],
])(
  "a %s control's own id in a field stays what its buttons point at after an update",
  async (kind, id) => {
    const value = ref<number | string | null>(kind === "number input" ? 1 : "a")
    const control = () =>
      kind === "number input"
        ? h(
            NumberInput,
            {
              value: value.value as number,
              "onUpdate:value": (next: number) => (value.value = next),
            },
            () => [
              h(NumberInputDecrement),
              h(NumberInputControl, { id }),
              h(NumberInputIncrement),
            ]
          )
        : h(
            PasswordInput,
            {
              value: value.value as string,
              "onUpdate:value": (next: string) => (value.value = next),
            },
            () => [h(PasswordInputControl, { id }), h(PasswordInputToggle)]
          )
    const root = document.createElement("div")
    document.body.append(root)
    const app = createApp(() =>
      h(Field, null, () => [h(FieldLabel, null, () => "Label"), control()])
    )
    app.mount(root)
    await settle()
    value.value = kind === "number input" ? 2 : "ab"
    await settle()
    const pointed = [...root.querySelectorAll("[aria-controls]")].map((el) =>
      el.getAttribute("aria-controls")
    )
    expect(pointed.length).toBeGreaterThan(0)
    expect(pointed.every((target) => target === id)).toBe(true)
    expect(
      root.querySelector('[data-slot="field-label"]')!.getAttribute("for")
    ).toBe(id)
    app.unmount()
    root.remove()
  }
)

test.each([
  ["a range", "one thumb", [20, 80], 30],
  ["one thumb", "a range", 30, [20, 80]],
])(
  "a slider in a field switched from %s to %s points its label at an input or nowhere",
  async (_from, _to, before, after) => {
    const value = ref<number | number[]>(before)
    const thumbs = () =>
      Array.isArray(value.value) ? value.value : [value.value]
    const root = document.createElement("div")
    document.body.append(root)
    const app = createApp(() =>
      h(Field, null, () => [
        h(FieldLabel, null, () => "Price"),
        h(Slider, { modelValue: value.value }, () =>
          h(SliderControl, null, () =>
            h(SliderTrack, null, () =>
              thumbs().map((_, index) => h(SliderThumb, { key: index, index }))
            )
          )
        ),
      ])
    )
    app.mount(root)
    await settle()
    value.value = after
    await settle()
    const target = root
      .querySelector('[data-slot="field-label"]')!
      .getAttribute("for")
    if (target !== null) {
      expect(document.getElementById(target)?.tagName).toBe("INPUT")
    }
    const ids = [...root.querySelectorAll("[id]")].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    app.unmount()
    root.remove()
  }
)
