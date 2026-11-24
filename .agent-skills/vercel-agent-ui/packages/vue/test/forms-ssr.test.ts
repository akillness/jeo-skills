// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Checkbox,
  CheckboxGroup,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputIncrement,
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
  Radio,
  RadioGroup,
  Select,
  SelectTrigger,
  Slider,
  SliderControl,
  SliderThumb,
  SliderTrack,
  SliderValue,
  Switch,
} from "../src"

const render = (node: () => unknown) =>
  renderToString(createSSRApp(() => node()))

// Opening tags, and an attribute of one.
const tags = (html: string) => html.match(/<[a-z][^>]*>/g) ?? []
const attribute = (tag: string | undefined, name: string) =>
  tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

// The ids a label or control reference points at that no element has. A
// control points at its field's description before one renders, so that one
// isn't checked.
const dangling = (html: string) => {
  const ids = new Set(tags(html).map((tag) => attribute(tag, "id")))
  return ["for", "aria-controls", "aria-labelledby"]
    .flatMap((name) =>
      tags(html).flatMap((tag) => attribute(tag, name)?.split(" ") ?? [])
    )
    .filter((id) => !ids.has(id))
}

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering form controls", () => {
  test("a checkbox renders a hidden native input that submits before hydration", async () => {
    const html = await render(() =>
      h(Checkbox, {
        name: "terms",
        value: "yes",
        defaultChecked: true,
        required: true,
      })
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="checkbox"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toMatch(
      /<input[^>]*type="checkbox"[^>]*name="terms"[^>]*value="yes"[^>]*checked[^>]*required/
    )
  })

  test("a switch renders its role and hidden input", async () => {
    const html = await render(() =>
      h(Switch, { name: "wifi", defaultChecked: true })
    )
    expect(html).toContain('role="switch"')
    expect(html).toMatch(/<input[^>]*name="wifi"[^>]*checked/)
  })

  test("a radio group renders one tab stop and a named radio per item", async () => {
    const html = await render(() =>
      h(RadioGroup, { name: "plan" }, () => [
        h(Radio, { value: "free", disabled: true }),
        h(Radio, { value: "pro" }),
        h(Radio, { value: "team" }),
      ])
    )
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/type="radio"[^>]*name="plan"/g)).toHaveLength(3)
  })

  test("a checkbox group names its checkboxes", async () => {
    const html = await render(() =>
      h(
        CheckboxGroup,
        {
          name: "toppings",
          defaultValue: ["cheese"],
          allValues: ["cheese", "olives"],
        },
        () => [
          h(Checkbox, { parent: true }),
          h(Checkbox, { value: "cheese" }),
          h(Checkbox, { value: "olives" }),
        ]
      )
    )
    expect(html).toContain('aria-checked="mixed"')
    expect(html.match(/name="toppings"/g)).toHaveLength(2)
  })

  test("a field ties its label to the control", async () => {
    const html = await render(() =>
      h(Field, null, () => [
        h(FieldLabel, null, () => "Email"),
        h(FieldControl, { type: "email" }),
      ])
    )
    const id = html.match(/<input[^>]*id="([^"]+)"/)![1]
    expect(html).toContain(`for="${id}"`)
  })

  test.each([
    [
      "NumberInput",
      () =>
        h(NumberInput, null, () => [
          h(NumberInputDecrement),
          h(NumberInputControl),
          h(NumberInputIncrement),
        ]),
    ],
    [
      "PasswordInput",
      () =>
        h(PasswordInput, null, () => [
          h(PasswordInputControl),
          h(PasswordInputToggle),
        ]),
    ],
    [
      "Slider",
      () =>
        h(Slider, null, () => [
          h(SliderControl, null, () =>
            h(SliderTrack, null, () => h(SliderThumb))
          ),
          h(SliderValue),
        ]),
    ],
  ])("a field ties its label to a %s's control", async (_name, control) => {
    const html = await render(() =>
      h(Field, null, () => [h(FieldLabel, null, () => "Amount"), control()])
    )
    const label = attribute(
      tags(html).find((tag) => tag.includes('data-slot="field-label"')),
      "for"
    )
    expect(tags(html).find((tag) => attribute(tag, "id") === label)).toMatch(
      /^<input/
    )
    expect(dangling(html)).toEqual([])
  })

  test("a field's label points at a range slider's first input and names its group", async () => {
    const html = await render(() =>
      h(Field, null, () => [
        h(FieldLabel, null, () => "Price"),
        h(Slider, { defaultValue: [20, 80] }, () =>
          h(SliderControl, null, () =>
            h(SliderTrack, null, () => [
              h(SliderThumb, { index: 0 }),
              h(SliderThumb, { index: 1 }),
            ])
          )
        ),
      ])
    )
    const label = tags(html).find((tag) =>
      tag.includes('data-slot="field-label"')
    )
    const target = tags(html).find(
      (tag) => attribute(tag, "id") === attribute(label, "for")
    )
    expect(target).toMatch(/^<input[^>]*type="range"/)
    const group = tags(html).find((tag) => tag.includes('role="group"'))
    expect(attribute(group, "aria-labelledby")).toBe(attribute(label, "id"))
    expect(dangling(html)).toEqual([])
  })

  test.each([
    ["FieldControl", FieldControl],
    ["Input", Input],
  ])(
    "a %s keeps its own description ahead of the field's",
    async (_name, control) => {
      const html = await render(() =>
        h(Field, null, () => [
          h(control, { "aria-describedby": "hint" }),
          h(FieldDescription, null, () => "We never share it."),
        ])
      )
      const input = tags(html).find((tag) => tag.startsWith("<input"))
      const text = tags(html).find((tag) =>
        tag.includes('data-slot="field-description"')
      )
      expect(attribute(input, "aria-describedby")).toBe(
        `hint ${attribute(text, "id")}`
      )
    }
  )
})

// Before hydration, the parts register nothing, so the server's HTML has to
// carry the relationships the hydrated page has, wherever the parts render.
describe.each(["before", "after"])(
  "server rendering a field with its description %s the control",
  (order) => {
    test.each(["input", "select"])(
      "its label names the %s and its description describes it",
      async (kind) => {
        const description = () => h(FieldDescription, null, () => "Pick one.")
        const control = () =>
          kind === "input" ? h(Input) : h(Select, null, () => h(SelectTrigger))
        const html = await render(() =>
          h(Field, null, () => [
            h(FieldLabel, null, () => "Fruit"),
            order === "before" && description(),
            control(),
            order === "after" && description(),
          ])
        )
        const label = tags(html).find((tag) => tag.startsWith("<label"))
        const element = tags(html).find(
          (tag) => attribute(tag, "id") === attribute(label, "for")
        )
        expect(element).toMatch(
          kind === "input" ? /^<input/ : /^<button[^>]*role="combobox"/
        )
        expect(attribute(element, "aria-labelledby")).toBe(
          attribute(label, "id")
        )
        const text = tags(html).find((tag) =>
          tag.includes('data-slot="field-description"')
        )
        expect(attribute(element, "aria-describedby")).toBe(
          attribute(text, "id")
        )
      }
    )
  }
)
