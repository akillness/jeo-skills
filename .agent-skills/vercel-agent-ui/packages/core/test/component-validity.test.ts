// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import {
  onValidityChange,
  setComponentValidity,
} from "../src/foundation/forms/form"

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

const input = () => document.createElement("input")

test("a component's message blocks the input until it clears it", () => {
  const el = input()
  setComponentValidity(el, "Enter a valid date.")
  expect(el.validity.customError).toBe(true)
  expect(el.validationMessage).toBe("Enter a valid date.")
  setComponentValidity(el, "")
  expect(el.validity.valid).toBe(true)
})

test("clearing puts back the message the app had set", () => {
  const el = input()
  el.setCustomValidity("Taken by the server.")
  setComponentValidity(el, "Enter a valid date.")
  expect(el.validationMessage).toBe("Enter a valid date.")
  setComponentValidity(el, "")
  expect(el.validationMessage).toBe("Taken by the server.")
})

test("a message the app sets while the component holds one stays when the component clears", () => {
  const el = input()
  setComponentValidity(el, "Enter a valid date.")
  el.setCustomValidity("Taken by the server.")
  setComponentValidity(el, "")
  expect(el.validationMessage).toBe("Taken by the server.")
})

test("fields hear each change, and nothing when the message stays the same", () => {
  const el = input()
  const heard: HTMLElement[] = []
  cleanups.push(onValidityChange((control) => heard.push(control)))
  setComponentValidity(el, "Enter a valid date.")
  setComponentValidity(el, "Enter a valid date.")
  setComponentValidity(el, "")
  setComponentValidity(el, "")
  expect(heard).toEqual([el, el])
})

test("clearing while the input is disabled leaves it valid once enabled", () => {
  const el = input()
  setComponentValidity(el, "Enter a valid date.")
  el.disabled = true
  setComponentValidity(el, "")
  el.disabled = false
  expect(el.validity.valid).toBe(true)
})

test("a message the app had set comes back when the component clears while disabled", () => {
  const el = input()
  el.setCustomValidity("Taken by the server.")
  setComponentValidity(el, "Enter a valid date.")
  el.disabled = true
  setComponentValidity(el, "")
  el.disabled = false
  expect(el.validationMessage).toBe("Taken by the server.")
})
