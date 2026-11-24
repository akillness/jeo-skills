// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../src/field"
import { Input, InputClear, InputGroup } from "../src/input"
import { Textarea } from "../src/textarea"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering text fields and forms", () => {
  test("an input renders its default value and filled state", () => {
    const html = renderToString(
      <Input name="email" defaultValue="ada@example.com" required />
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*name="email"[^>]*value="ada@example.com"/)
    expect(html).toContain('required=""')
    expect(html).toContain('data-filled=""')
    expect(html).toContain('data-slot="input"')
  })

  test("a textarea renders its default value as its text", () => {
    const html = renderToString(<Textarea defaultValue="Hello" autoResize />)
    expect(html).toMatch(/<textarea[^>]*data-filled=""[^>]*>Hello<\/textarea>/)
  })

  test("an invalid field renders its error and marks its control", () => {
    const html = renderToString(
      <Field name="email" invalid>
        <FieldLabel>Email</FieldLabel>
        <Input type="email" />
        <FieldError>This email bounced.</FieldError>
      </Field>
    )
    expect(html).toContain("This email bounced.")
    expect(html).toContain('aria-invalid="true"')
    expect(html).not.toContain("data-valid")
  })

  test.each([
    [[true]],
    [["valueMissing", true]],
    [[true, true]],
    [[undefined, true]],
  ] as const)(
    "errors shown on a server keep their own ids, and the first is described (%j)",
    (matches) => {
      const html = renderToString(
        <Field name="email" invalid>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" />
          {matches.map((match, index) => (
            <FieldError key={index} match={match}>
              Error {index}
            </FieldError>
          ))}
        </Field>
      )
      const { errors: ids, described } = errorIds(html)
      expect(new Set(ids).size).toBe(ids.length)
      expect(described).toContain(ids[0])
    }
  )

  test("a field shows no errors before a submit, and none with invalid={false}", () => {
    for (const invalid of [undefined, false]) {
      const html = renderToString(
        <Field name="email" invalid={invalid}>
          <Input type="email" required />
          <FieldError>Enter your email.</FieldError>
        </Field>
      )
      expect(html).not.toContain("Enter your email.")
      expect(html).not.toContain("aria-invalid")
    }
  })

  test("a disabled field set renders a native disabled fieldset", () => {
    const html = renderToString(
      <FieldSet disabled>
        <FieldLegend>Contact</FieldLegend>
        <Input />
      </FieldSet>
    )
    expect(html).toMatch(/<fieldset[^>]*disabled=""[^>]*data-disabled=""/)
    expect(html).toMatch(/<legend[^>]*>Contact<\/legend>/)
  })

  test("a clear button renders nothing until it binds", () => {
    const html = renderToString(
      <InputGroup>
        <Input defaultValue="shoes" />
        <InputClear>Clear</InputClear>
      </InputGroup>
    )
    expect(html).toContain('data-slot="input-group"')
    expect(html).not.toContain("Clear")
  })
})

// The ids of the field's errors and of what its control's description names.
const errorIds = (html: string) => ({
  errors: [...html.matchAll(/<[^>]*data-slot="field-error"[^>]*>/g)].map(
    ([tag]) => tag.match(/\sid="([^"]+)"/)![1]
  ),
  described: html.match(/<input[^>]*aria-describedby="([^"]+)"/)![1].split(" "),
})
