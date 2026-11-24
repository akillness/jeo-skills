import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { Button } from "../src/button"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../src/field"
import { Input, InputClear, InputGroup } from "../src/input"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "../src/number-input"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "../src/otp-input"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "../src/password-input"
import { Separator } from "../src/separator"
import {
  Slider,
  SliderControl,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "../src/slider"
import { Textarea } from "../src/textarea"

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
// Solid renders boolean attributes bare, like `required`, and marks elements
// with hydration keys, so matches allow attributes between.

describe("server rendering text fields and forms", () => {
  test("an input renders its default value and filled state", () => {
    const html = renderToString(() => (
      <Input name="email" defaultValue="ada@example.com" required />
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*name="email"[^>]*value="ada@example.com"/)
    expect(html).toMatch(/\srequired[\s>]/)
    expect(html).toMatch(/\sdata-filled[\s>]/)
    expect(html).toContain('data-slot="input"')
  })

  test("a controlled input renders its value", () => {
    const html = renderToString(() => <Input value="grace" />)
    expect(html).toMatch(/<input[^>]*value="grace"/)
  })

  test("a textarea renders its default value as its text", () => {
    const html = renderToString(() => (
      <Textarea defaultValue="Hello" autoResize />
    ))
    expect(html).toMatch(/<textarea[^>]*\sdata-filled[^>]*>Hello<\/textarea>/)
  })

  test("an invalid field renders its error and marks its control", () => {
    const html = renderToString(() => (
      <Field name="email" invalid>
        <FieldLabel>Email</FieldLabel>
        <Input type="email" />
        <FieldError>This email bounced.</FieldError>
      </Field>
    ))
    expect(html).toContain("This email bounced.")
    expect(html).toContain('aria-invalid="true"')
    expect(html).not.toContain("data-valid")
  })

  test.each([
    [
      "NumberInput",
      () => (
        <NumberInput>
          <NumberInputDecrement />
          <NumberInputControl />
          <NumberInputIncrement />
        </NumberInput>
      ),
    ],
    [
      "PasswordInput",
      () => (
        <PasswordInput>
          <PasswordInputControl />
          <PasswordInputToggle />
        </PasswordInput>
      ),
    ],
    [
      "Slider",
      () => (
        <Slider>
          <SliderControl>
            <SliderTrack>
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
          <SliderValue />
        </Slider>
      ),
    ],
  ])("a field ties its label to a %s's control", (_name, control) => {
    const html = renderToString(() => (
      <Field>
        <FieldLabel>Amount</FieldLabel>
        {control()}
      </Field>
    ))
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
    const html = renderToString(() => (
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
    ))
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
    ["FieldControl", () => <FieldControl aria-describedby="hint" />],
    ["Input", () => <Input aria-describedby="hint" />],
  ])(
    "a %s keeps its own description ahead of the field's",
    (_name, control) => {
      const html = renderToString(() => (
        <Field>
          {control()}
          <FieldDescription>We never share it.</FieldDescription>
        </Field>
      ))
      const description = html.match(/<p[^>]*id="([^"]+)"/)![1]
      expect(html).toMatch(
        new RegExp(`<input[^>]*aria-describedby="hint ${description}"`)
      )
    }
  )

  test("a disabled field set renders a native disabled fieldset", () => {
    const html = renderToString(() => (
      <FieldSet disabled>
        <FieldLegend>Contact</FieldLegend>
        <Input />
      </FieldSet>
    ))
    expect(html).toMatch(/<fieldset[^>]*\sdisabled[\s>]/)
    expect(html).toMatch(/<fieldset[^>]*\sdata-disabled[\s>]/)
    expect(html).toMatch(/<legend[^>]*>Contact<\/legend>/)
  })

  test("a clear button renders nothing until it binds", () => {
    const html = renderToString(() => (
      <InputGroup>
        <Input defaultValue="shoes" />
        <InputClear>Clear</InputClear>
      </InputGroup>
    ))
    expect(html).toContain('data-slot="input-group"')
    expect(html).not.toContain("Clear")
  })
})

describe("server rendering a password input", () => {
  const password = (defaultVisible?: boolean) => (
    <PasswordInput name="password" required defaultVisible={defaultVisible}>
      <PasswordInputControl aria-label="Password" />
      <PasswordInputToggle aria-label="Show password" />
    </PasswordInput>
  )

  test("the server renders a password field with its form attributes and a toggle button", () => {
    const html = renderToString(() => password())
    expect(html).toContain('type="password"')
    expect(html).toContain('name="password"')
    expect(html).toContain('autocomplete="current-password"')
    expect(html).toContain('spellcheck="false"')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="false"/)
  })

  test("a password shown from the start renders as a text field", () => {
    const html = renderToString(() => password(true))
    expect(html).toContain('type="text"')
    expect(html).toContain('aria-pressed="true"')
  })
})

describe("server rendering a number input and an OTP input", () => {
  test("a number input renders its formatted text and a hidden input that submits the number", () => {
    const html = renderToString(() => (
      <NumberInput
        name="amount"
        defaultValue={1234.5}
        locale="en-US"
        format={{ style: "currency", currency: "USD" }}
      >
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Decrease" />
          <NumberInputControl />
          <NumberInputIncrement aria-label="Increase" />
        </NumberInputGroup>
      </NumberInput>
    ))
    expect(html).toMatch(/<input[^>]*type="text"[^>]*value="\$1,234.50"/)
    expect(html).toMatch(
      /<input[^>]*type="hidden"[^>]*name="amount"[^>]*value="1234.5"/
    )
    expect(html).toContain('role="group"')
  })

  test("an OTP input renders its code in the input and its slots", () => {
    const html = renderToString(() => (
      <OTPInput name="code" maxLength={4} defaultValue="12" aria-label="Code">
        <OTPInputGroup>
          <OTPInputSlot index={0} />
          <OTPInputSlot index={1} />
          <OTPInputSlot index={2} />
          <OTPInputSlot index={3} />
        </OTPInputGroup>
      </OTPInput>
    ))
    const [input] = html.match(/<input[^>]*>/g)!
    for (const attribute of ['name="code"', 'value="12"', 'maxlength="4"']) {
      expect(input).toContain(attribute)
    }
    expect(html).toMatch(/data-slot="otp-input-slot"[^>]*>1</)
  })
})

describe("server rendering buttons and separators", () => {
  test("a button renders as a native button that doesn't submit by default", () => {
    expect(renderToString(() => <Button>Save</Button>)).toMatch(
      /<button[^>]*type="button"/
    )
    expect(renderToString(() => <Button type="submit">Save</Button>)).toMatch(
      /type="submit"/
    )
  })

  test("a separator renders its role and orientation", () => {
    expect(renderToString(() => <Separator orientation="vertical" />)).toMatch(
      /role="separator"[^>]*aria-orientation="vertical"/
    )
    expect(renderToString(() => <Separator decorative />)).toContain(
      'role="none"'
    )
  })
})
