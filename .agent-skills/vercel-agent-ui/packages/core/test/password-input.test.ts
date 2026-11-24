import { describe, expect, test, vi } from "vitest"
import { passwordInput } from "../src/components/password-input/password-input"
import {
  attrs,
  handlers,
  partState,
  press,
} from "../src/foundation/kernel/part"

describe("password input", () => {
  test("starts hidden, as a password field that password managers fill", () => {
    const instance = passwordInput({ id: "p" })
    expect(attrs(instance.part("control", {}))).toMatchObject({
      type: "password",
      autocomplete: "current-password",
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    })
    expect(attrs(instance.part("toggle", {}))).toMatchObject({
      type: "button",
      "aria-pressed": "false",
      "aria-controls": "p-control",
    })
  })

  test("defaultVisible starts shown, as a text field", () => {
    const instance = passwordInput({ id: "p", defaultVisible: true })
    expect(attrs(instance.part("control", {})).type).toBe("text")
    expect(attrs(instance.part("toggle", {}))["aria-pressed"]).toBe("true")
    expect(attrs(instance.part("root", {}))["data-visible"]).toBe("")
  })

  test("the controller shows and hides it, with the reason", () => {
    const onVisibleChange = vi.fn()
    const { api } = passwordInput({ id: "p", onVisibleChange })
    expect(api.toggleVisible()).toBe(true)
    expect(api.isVisible()).toBe(true)
    expect(api.setVisible(false, { reason: "toggle-press" })).toBe(true)
    expect(
      onVisibleChange.mock.calls.map(([visible, details]) => [
        visible,
        details.reason,
      ])
    ).toEqual([
      [true, "imperative"],
      [false, "toggle-press"],
    ])
  })

  test("a canceled change keeps it as it was", () => {
    const { api } = passwordInput({
      id: "p",
      onVisibleChange: (_, details) => details.cancel(),
    })
    expect(api.toggleVisible()).toBe(false)
    expect(api.isVisible()).toBe(false)
  })

  test("a controlled visible waits for the owner", () => {
    const instance = passwordInput({
      id: "p",
      visible: false,
      onVisibleChange: () => {},
    })
    instance.api.toggleVisible()
    expect(instance.api.isVisible()).toBe(false)
    instance.setOptions({ id: "p", visible: true })
    expect(instance.api.isVisible()).toBe(true)
  })

  test("form attributes reach the field, and disabled reaches the toggle", () => {
    const instance = passwordInput({
      id: "p",
      name: "password",
      required: true,
      disabled: true,
      autoComplete: "new-password",
    })
    expect(attrs(instance.part("control", {}))).toMatchObject({
      name: "password",
      required: "",
      disabled: "",
      autocomplete: "new-password",
    })
    expect(attrs(instance.part("toggle", {}))).toMatchObject({
      disabled: "",
      "data-disabled": "",
    })
  })

  test("read-only still lets the toggle show the password", () => {
    const instance = passwordInput({ id: "p", readOnly: true })
    expect(attrs(instance.part("control", {})).readonly).toBe("")
    expect(attrs(instance.part("toggle", {})).disabled).toBeUndefined()
  })

  test("the value is a text field's, controlled or not", () => {
    const onValueChange = vi.fn()
    const instance = passwordInput({
      id: "p",
      defaultValue: "hunter2",
      onValueChange,
    })
    expect(instance.api.getValue()).toBe("hunter2")
    expect(partState(instance.part("root", {})).filled).toBe(true)
    instance.api.clear()
    expect(onValueChange).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ reason: "imperative" })
    )
  })
})

describe("password input without a DOM", () => {
  test("a toggle press without an event shows the password", () => {
    const onVisibleChange = vi.fn()
    const instance = passwordInput({ id: "p", onVisibleChange })
    press(instance.part("toggle", {}))?.()
    expect(instance.api.isVisible()).toBe(true)
    expect(onVisibleChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: "toggle-press" })
    )
  })

  test("a field removed while it has focus blurs without its element", () => {
    const instance = passwordInput({ id: "p" })
    const { focusout } = handlers(instance.part("control", {}))
    expect(() => focusout!(new Event("focusout"))).not.toThrow()
  })
})
