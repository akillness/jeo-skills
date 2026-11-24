import type { Component } from "svelte"
import { render } from "svelte/server"
import { describe, expect, test } from "vitest"
import {
  Calendar,
  Checkbox,
  DatePicker,
  Listbox,
  NumberInput,
  OTPInput,
  PasswordInput,
  RadioGroup,
  Switch,
} from "../src"
import App from "./apps/form-app.svelte"

// The body without Svelte's hydration markers, so text content can be matched.
const html = (
  which:
    | "input"
    | "textarea"
    | "errors"
    | "fieldset"
    | "readonly-input"
    | "readonly-textarea"
) => render(App, { props: { which } }).body.replace(/<!--.*?-->/g, "")

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering text fields and forms", () => {
  test("an input renders its default value and filled state", () => {
    const body = html("input")
    expect(typeof window).toBe("undefined")
    expect(body).toMatch(/<input[^>]*value="ada@example.com"/)
    expect(body).toContain("data-filled")
    expect(body).not.toContain("defaultvalue")
  })

  test("a textarea renders its default value as its text", () => {
    expect(html("textarea")).toMatch(/<textarea[^>]*>Hello<\/textarea>/)
  })

  test("an invalid field renders its error and marks its control", () => {
    const body = html("errors")
    expect(body).toContain("This email bounced.")
    expect(body).toContain('aria-invalid="true"')
  })

  test("a disabled field set renders a native disabled fieldset", () => {
    const body = html("fieldset")
    expect(body).toMatch(/<fieldset[^>]*disabled/)
    expect(body).toMatch(/<legend[^>]*>Contact<\/legend>/)
  })

  test("a native readonly attribute keeps an input or textarea read-only", () => {
    for (const which of ["readonly-input", "readonly-textarea"] as const) {
      const body = html(which)
      expect(body).toMatch(/readonly/)
      expect(body).toContain("data-readonly")
    }
  })

  test("a native readonly attribute keeps every other read-only control read-only", () => {
    const controls = [
      Calendar,
      Checkbox,
      DatePicker,
      Listbox,
      NumberInput,
      OTPInput,
      PasswordInput,
      RadioGroup,
      Switch,
    ]
    // Where the attribute itself lands differs, the state it sets doesn't.
    const body = (
      component: (typeof controls)[number],
      props: Record<string, unknown>
    ) =>
      render(component as Component<Record<string, unknown>>, {
        props,
      }).body.replace(/ readonly(="")?(?=[\s>])/g, "")
    for (const component of controls) {
      expect(body(component, { readonly: true }), component.name).toBe(
        body(component, { readOnly: true })
      )
    }
  })
})
