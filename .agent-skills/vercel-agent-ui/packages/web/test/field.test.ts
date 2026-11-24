// @vitest-environment jsdom
// `invalid` is three-way on the element too: no attribute lets the browser
// decide, `invalid` marks the field invalid and `invalid="false"` keeps it valid.
import { expect, test } from "vitest"
import { defineFieldElements } from "../src/field"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("the invalid attribute switches between the browser, invalid and valid", async () => {
  defineFieldElements()
  document.body.innerHTML = `<form><ui-field name="email"><ui-field-label>Email</ui-field-label><input type="email" required /><ui-field-error>Taken.</ui-field-error></ui-field></form>`
  await wait()
  const field = document.querySelector("ui-field")!
  const input = document.querySelector("input")!
  const error = document.querySelector("ui-field-error") as HTMLElement
  expect(input.hasAttribute("aria-invalid")).toBe(false)
  expect(error.hidden).toBe(true)

  field.setAttribute("invalid", "")
  await wait()
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(error.hidden).toBe(false)

  field.setAttribute("invalid", "false")
  input.dispatchEvent(new Event("invalid", { cancelable: true }))
  await wait()
  expect(input.hasAttribute("aria-invalid")).toBe(false)
  expect(error.hidden).toBe(true)

  // Back to the browser: a submit that finds the control invalid shows the error.
  field.removeAttribute("invalid")
  await wait()
  expect(error.hidden).toBe(true)
  input.dispatchEvent(new Event("invalid", { cancelable: true }))
  await wait()
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(error.hidden).toBe(false)
})

// What a submit fires at an invalid control. Canceling it hides the browser's message.
function submit(input: HTMLInputElement) {
  const event = new Event("invalid", { cancelable: true })
  input.dispatchEvent(event)
  return event
}

test("only an error that shows now replaces the browser's message", async () => {
  defineFieldElements()
  document.body.innerHTML = `<form><ui-field name="email"><ui-field-label>Email</ui-field-label><input type="email" required /><ui-field-error match="true">Enter an email.</ui-field-error></ui-field></form>`
  await wait()
  const input = document.querySelector("input")!
  const error = document.querySelector("ui-field-error") as HTMLElement
  expect(submit(input).defaultPrevented).toBe(true)
  await wait()

  error.setAttribute("match", "false")
  await wait()
  expect(error.hidden).toBe(true)
  expect(submit(input).defaultPrevented).toBe(false)

  error.setAttribute("match", "valueMissing")
  await wait()
  expect(submit(input).defaultPrevented).toBe(true)
  await wait()

  error.remove()
  await wait()
  expect(submit(input).defaultPrevented).toBe(false)
})

test("an error removed in the same task no longer replaces the browser's message", async () => {
  defineFieldElements()
  document.body.innerHTML = `<form><ui-field name="email"><input type="email" required /><ui-field-error match="true">Enter an email.</ui-field-error></ui-field></form>`
  await wait()
  const input = document.querySelector("input")!
  document.querySelector("ui-field-error")!.remove()
  let prevented: boolean | undefined
  input.addEventListener(
    "invalid",
    (event) => (prevented = event.defaultPrevented),
    { once: true }
  )
  expect(input.reportValidity()).toBe(false)
  expect(prevented).toBe(false)
})

test("the invalid property switches between the browser, invalid and valid", async () => {
  defineFieldElements()
  document.body.innerHTML = `<form><ui-field name="email"><ui-field-label>Email</ui-field-label><input type="email" required /><ui-field-error>Taken.</ui-field-error></ui-field></form>`
  await wait()
  const field = document.querySelector("ui-field")!
  const input = document.querySelector("input")!
  const error = document.querySelector("ui-field-error") as HTMLElement

  field.invalid = true
  await wait()
  expect(field.invalid).toBe(true)
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(error.hidden).toBe(false)

  field.invalid = false
  submit(input)
  await wait()
  expect(input.hasAttribute("aria-invalid")).toBe(false)
  expect(error.hidden).toBe(true)
  // The control keeps its own validity.
  expect(input.validity.valid).toBe(false)

  field.invalid = undefined
  await wait()
  expect(error.hidden).toBe(true)
  submit(input)
  await wait()
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect(error.hidden).toBe(false)

  // The property and the attribute are one, so the last one written decides.
  field.invalid = false
  field.setAttribute("invalid", "")
  await wait()
  expect(field.invalid).toBe(true)
  expect(input.getAttribute("aria-invalid")).toBe("true")
})

test("the invalid property writes the attribute, three ways", async () => {
  defineFieldElements()
  document.body.innerHTML = `<ui-field invalid><input /></ui-field>`
  await wait()
  const field = document.querySelector("ui-field")!
  expect(field.invalid).toBe(true)
  field.invalid = false
  expect(field.getAttribute("invalid")).toBe("false")
  expect(field.invalid).toBe(false)
  field.invalid = undefined
  expect(field.hasAttribute("invalid")).toBe(false)
  expect(field.invalid).toBeUndefined()
  field.invalid = true
  expect(field.getAttribute("invalid")).toBe("")
  await wait()
  expect(document.querySelector("input")!.getAttribute("aria-invalid")).toBe(
    "true"
  )
})

test("a native input whose id is removed keeps its label", async () => {
  defineFieldElements()
  document.body.innerHTML = `<ui-field><ui-field-label as-child><label>Name</label></ui-field-label><input id="name" /></ui-field>`
  await wait()
  const input = document.querySelector("input")!
  const label = document.querySelector("label")!
  expect(label.control).toBe(input)
  input.removeAttribute("id")
  await wait()
  expect(input.id).not.toBe("")
  expect(label.control).toBe(input)
})
