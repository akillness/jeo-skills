// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Checkbox, CheckboxGroup, CheckboxIndicator } from "../src/checkbox"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../src/field"
import { DatePicker, DatePickerInput } from "../src/date-picker"
import { Input } from "../src/input"
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
import { Radio, RadioGroup } from "../src/radio"
import { Select, SelectTrigger } from "../src/select"
import {
  Slider,
  SliderControl,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "../src/slider"
import { Switch } from "../src/switch"

// The attributes of every <input> in the markup, in any order.
const inputs = (html: string) => html.match(/<input[^>]*>/g) ?? []

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
  test("a checkbox renders a hidden native input that submits before hydration", () => {
    const html = renderToString(
      <Checkbox name="terms" value="yes" defaultChecked required>
        <CheckboxIndicator />
      </Checkbox>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="checkbox"')
    expect(html).toContain('aria-checked="true"')
    const [input] = inputs(html)
    for (const attribute of [
      'type="checkbox"',
      'name="terms"',
      'value="yes"',
      'checked=""',
      'required=""',
    ]) {
      expect(input).toContain(attribute)
    }
    expect(html).toContain('data-slot="checkbox-indicator"')
  })

  test("an indeterminate checkbox says mixed", () => {
    const html = renderToString(<Checkbox defaultChecked="indeterminate" />)
    expect(html).toContain('aria-checked="mixed"')
    expect(html).toContain("data-indeterminate")
  })

  test("a switch renders its role and hidden input", () => {
    const html = renderToString(<Switch name="wifi" defaultChecked />)
    expect(html).toContain('role="switch"')
    expect(html).toMatch(/<input[^>]*name="wifi"[^>]*checked=""/)
  })

  test("a radio group renders one tab stop and a named radio per item", () => {
    const html = renderToString(
      <RadioGroup name="plan" required>
        <Radio value="free" disabled />
        <Radio value="pro" />
        <Radio value="team" />
      </RadioGroup>
    )
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/type="radio"[^>]*name="plan"/g)).toHaveLength(3)
  })

  test("a checkbox group names its checkboxes and checks its default values", () => {
    const html = renderToString(
      <CheckboxGroup
        name="toppings"
        defaultValue={["cheese"]}
        allValues={["cheese", "olives"]}
      >
        <Checkbox parent />
        <Checkbox value="cheese" />
        <Checkbox value="olives" />
      </CheckboxGroup>
    )
    expect(html).toContain('aria-checked="mixed"')
    const cheese = inputs(html).find((input) =>
      input.includes('value="cheese"')
    )!
    expect(cheese).toContain('name="toppings"')
    expect(cheese).toContain('checked=""')
    expect(html.match(/name="toppings"/g)).toHaveLength(2)
  })

  test("a field ties its label to the control", () => {
    const html = renderToString(
      <Field>
        <FieldLabel>Email</FieldLabel>
        <FieldControl type="email" required />
        <FieldDescription>We never share it.</FieldDescription>
        <FieldError />
      </Field>
    )
    const id = html.match(/<input[^>]*id="([^"]+)"/)![1]
    expect(html).toContain(`for="${id}"`)
    expect(html).not.toContain('data-slot="field-error"')
  })

  test.each([
    [
      "NumberInput",
      <NumberInput>
        <NumberInputDecrement />
        <NumberInputControl />
        <NumberInputIncrement />
      </NumberInput>,
    ],
    [
      "PasswordInput",
      <PasswordInput>
        <PasswordInputControl />
        <PasswordInputToggle />
      </PasswordInput>,
    ],
    [
      "Slider",
      <Slider>
        <SliderControl>
          <SliderTrack>
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
        <SliderValue />
      </Slider>,
    ],
  ])("a field ties its label to a %s's control", (_name, control) => {
    const html = renderToString(
      <Field>
        <FieldLabel>Amount</FieldLabel>
        {control}
      </Field>
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

  test("a field's label points at a range slider's first input and names its group", () => {
    const html = renderToString(
      <Field>
        <FieldLabel>Price</FieldLabel>
        <Slider defaultValue={[20, 80]}>
          <SliderControl>
            <SliderTrack>
              <SliderThumb index={0} />
              <SliderThumb index={1} />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </Field>
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
    ["FieldControl", <FieldControl aria-describedby="hint" />],
    ["Input", <Input aria-describedby="hint" />],
    [
      "FieldControl's render element",
      <FieldControl render={<input aria-describedby="hint" />} />,
    ],
    [
      "Input's render element",
      <Input render={<input aria-describedby="hint" />} />,
    ],
    [
      "NumberInput's render element",
      <NumberInput>
        <NumberInputControl render={<input aria-describedby="hint" />} />
      </NumberInput>,
    ],
    [
      "DatePicker's render element",
      <DatePicker>
        <DatePickerInput render={<input aria-describedby="hint" />} />
      </DatePicker>,
    ],
  ])(
    "a %s keeps its own description ahead of the field's",
    (_name, control) => {
      const html = renderToString(
        <Field>
          {control}
          <FieldDescription>We never share it.</FieldDescription>
        </Field>
      )
      const text = tags(html).find((tag) =>
        tag.includes('data-slot="field-description"')
      )
      expect(attribute(inputs(html)[0], "aria-describedby")).toBe(
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
      (kind) => {
        const description = <FieldDescription>Pick one.</FieldDescription>
        const control =
          kind === "input" ? (
            <Input />
          ) : (
            <Select>
              <SelectTrigger />
            </Select>
          )
        const html = renderToString(
          <Field>
            <FieldLabel>Fruit</FieldLabel>
            {order === "before" && description}
            {control}
            {order === "after" && description}
          </Field>
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
