// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test, vi } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Autocomplete,
  AutocompleteInput,
  Calendar,
  Checkbox,
  Combobox,
  ComboboxInput,
  DatePicker,
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  Listbox,
  NumberInput,
  OTPInput,
  PasswordInput,
  RadioGroup,
  Select,
  SelectTrigger,
  Switch,
  Textarea,
  TokenInput,
  TokenInputEditor,
} from "../src"

const render = (node: () => unknown) =>
  renderToString(createSSRApp(() => node()))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering text fields and forms", () => {
  test("an input renders its default value and filled state", async () => {
    const html = await render(() =>
      h(Input, {
        name: "email",
        defaultValue: "ada@example.com",
        required: true,
      })
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<input[^>]*value="ada@example.com"/)
    expect(html).toContain("data-filled")
  })

  test("a textarea renders its default value as its text", async () => {
    const html = await render(() =>
      h(Textarea, { defaultValue: "Hello", autoResize: true })
    )
    expect(html).toMatch(/<textarea[^>]*>Hello<\/textarea>/)
  })

  test("an invalid field renders its error and marks its control", async () => {
    const html = await render(() =>
      h(Field, { name: "email", invalid: true }, () => [
        h(FieldLabel, () => "Email"),
        h(Input),
        h(FieldError, () => "This email bounced."),
      ])
    )
    expect(html).toContain("This email bounced.")
    expect(html).toContain('aria-invalid="true"')
  })

  test.each([
    [[true]],
    [["valueMissing", true]],
    [[true, true]],
    [[undefined, true]],
  ] as const)(
    "errors shown on a server keep their own ids, and the first is described (%j)",
    async (matches) => {
      const html = await render(() =>
        h(Field, { name: "email", invalid: true }, () => [
          h(FieldLabel, () => "Email"),
          h(Input),
          ...matches.map((match, index) =>
            h(FieldError, { match }, () => `Error ${index}`)
          ),
        ])
      )
      const { errors: ids, described } = errorIds(html)
      expect(new Set(ids).size).toBe(ids.length)
      expect(described).toContain(ids[0])
    }
  )

  test("a field shows no errors before a submit, and none with invalid false", async () => {
    for (const invalid of [undefined, false]) {
      const html = await render(() =>
        h(Field, { name: "email", invalid }, () => [
          h(Input, { required: true }),
          h(FieldError, () => "Bad."),
        ])
      )
      expect(html).not.toContain("Bad.")
      expect(html).not.toContain("aria-invalid")
    }
  })

  test("a disabled field set renders a native disabled fieldset", async () => {
    const html = await render(() =>
      h(FieldSet, { disabled: true }, () => [
        h(FieldLegend, () => "Contact"),
        h(Input),
      ])
    )
    expect(html).toMatch(/<fieldset[^>]*disabled/)
    expect(html).toMatch(/<legend[^>]*>Contact<\/legend>/)
  })

  test("a native readonly attribute keeps an input or textarea read-only", async () => {
    for (const component of [Input, Textarea]) {
      const html = await render(() =>
        h(component, { readonly: "", defaultValue: "Hi" })
      )
      expect(html).toMatch(/readonly/)
      expect(html).toContain("data-readonly")
    }
  })

  test("a native readonly attribute keeps every other read-only control read-only", async () => {
    const controls = [
      [Autocomplete, AutocompleteInput],
      [Calendar],
      [Checkbox],
      [Combobox, ComboboxInput],
      [DatePicker],
      [Listbox],
      [NumberInput],
      [OTPInput],
      [PasswordInput],
      [RadioGroup],
      [Select, SelectTrigger],
      [Switch],
      [TokenInput, TokenInputEditor],
    ] as const
    // Where the attribute itself lands differs, the state it sets doesn't.
    const withoutAttribute = (html: string) =>
      html.replace(/ readonly(?=[\s>])/g, "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const [component, child] of controls) {
      const content = child && (() => h(child))
      const native = await render(() => h(component, { readonly: "" }, content))
      const prop = await render(() => h(component, { readOnly: true }, content))
      const none = await render(() => h(component, {}, content))
      const unset = await render(() =>
        h(component, { readonly: null }, content)
      )
      expect(withoutAttribute(native), component.name).toBe(
        withoutAttribute(prop)
      )
      expect(unset, component.name).toBe(none)
    }
    expect(
      warn.mock.calls
        .flat()
        .filter((message) => String(message).includes("readonly"))
    ).toEqual([])
    warn.mockRestore()
  })
})

// The ids of the field's errors and of what its control's description names.
const errorIds = (html: string) => ({
  errors: [...html.matchAll(/<[^>]*data-slot="field-error"[^>]*>/g)].map(
    ([tag]) => tag.match(/\sid="([^"]+)"/)![1]
  ),
  described: html.match(/<input[^>]*aria-describedby="([^"]+)"/)![1].split(" "),
})
