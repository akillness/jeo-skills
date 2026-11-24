// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { DateInput } from "../src/date-input"
import { Field, FieldControl, FieldError, FieldLabel } from "../src/field"

// Errors without ids are parts of their own, so a submit reads each one's
// `match`, and only an error that shows replaces the browser's message.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  document.body.innerHTML = ""
})

function submit(input: HTMLInputElement) {
  const event = new Event("invalid", { cancelable: true })
  input.dispatchEvent(event)
  return event
}

test("each error's own `match` decides whether it replaces the browser's message", async () => {
  function Email({ second }: { second: "typeMismatch" | false }) {
    return (
      <form>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <FieldControl type="email" required />
          <FieldError match="valueMissing">Enter an email.</FieldError>
          {second && (
            <FieldError match={second}>Enter a valid email.</FieldError>
          )}
        </Field>
      </form>
    )
  }
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Email second="typeMismatch" />))
  const input = container.querySelector("input")!
  let event!: Event
  await React.act(async () => {
    event = submit(input)
  })
  expect(event.defaultPrevented).toBe(true)
  const errors = container.querySelectorAll('[data-slot="field-error"]')
  expect(errors).toHaveLength(1)
  expect(input.getAttribute("aria-describedby")).toContain(errors[0].id)
})

test("an error that changes its `match` or unmounts gives the message back", async () => {
  function Email({ match, shown }: { match: boolean; shown: boolean }) {
    return (
      <form>
        <Field>
          <FieldControl type="email" required />
          {shown && <FieldError match={match}>Enter an email.</FieldError>}
        </Field>
      </form>
    )
  }
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  const task = () => new Promise((resolve) => setTimeout(resolve))
  await React.act(async () => root!.render(<Email match shown />))
  const input = container.querySelector("input")!
  expect(submit(input).defaultPrevented).toBe(true)
  await task()

  await React.act(async () => root!.render(<Email match={false} shown />))
  expect(submit(input).defaultPrevented).toBe(false)

  await React.act(async () => root!.render(<Email match shown />))
  expect(submit(input).defaultPrevented).toBe(true)
  await task()

  await React.act(async () => root!.render(<Email match shown={false} />))
  expect(submit(input).defaultPrevented).toBe(false)
})

test("a date before `min` matches rangeUnderflow, though its segments carry a custom message", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () =>
    root!.render(
      <form>
        <Field>
          <FieldLabel>Pickup</FieldLabel>
          <DateInput
            defaultValue="2026-01-02"
            min="2026-06-01"
            locale="en-US"
          />
          <FieldError match="rangeUnderflow">Pick a later date.</FieldError>
        </Field>
      </form>
    )
  )
  await React.act(async () => new Promise((resolve) => setTimeout(resolve)))
  const segment = container.querySelector<HTMLInputElement>(
    '[role="spinbutton"]'
  )!
  let event!: Event
  await React.act(async () => {
    event = submit(segment)
  })
  expect(event.defaultPrevented).toBe(true)
  const error = container.querySelector('[data-slot="field-error"]')
  expect(error?.textContent).toBe("Pick a later date.")
})
