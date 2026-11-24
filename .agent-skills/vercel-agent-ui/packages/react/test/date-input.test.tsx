// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test, vi } from "vitest"
import { DateInput, DateInputSegment } from "../src/date-input"
import { Field, FieldLabel } from "../src/field"
import { TimeInput } from "../src/time-input"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  document.body.innerHTML = ""
})

async function render(node: React.ReactNode) {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(node))
  return container
}

const segment = (container: HTMLElement, type: string) =>
  container.querySelector<HTMLInputElement>(`input[data-type="${type}"]`)!

async function type(text: string) {
  for (const char of text) {
    await React.act(async () => {
      document.activeElement!.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: char,
          bubbles: true,
          cancelable: true,
        })
      )
    })
  }
}

const shown = (container: HTMLElement) =>
  [...container.querySelector('[role="group"]')!.children]
    .filter(
      (node) => !(node instanceof HTMLInputElement && node.type === "hidden")
    )
    .map((node) =>
      node instanceof HTMLInputElement ? node.value : node.textContent
    )
    .join("")
    .replace(/\s/g, " ")

test("the server renders each segment as an input with its value, and the hidden input", () => {
  const server = document.createElement("div")
  server.innerHTML = renderToString(
    <DateInput defaultValue="2026-11-02" name="start" locale="en-US" />
  )
  expect(
    server.querySelectorAll('[role="group"] [role="spinbutton"]')
  ).toHaveLength(3)
  expect(segment(server, "month").getAttribute("value")).toBe("11")
  expect(segment(server, "year").getAttribute("value")).toBe("2026")
  const hidden = server.querySelector<HTMLInputElement>('input[type="hidden"]')!
  expect([hidden.name, hidden.getAttribute("value")]).toEqual([
    "start",
    "2026-11-02",
  ])
})

test("typing a date fills the segments and reports the ISO value once", async () => {
  const onValueChange = vi.fn()
  const container = await render(
    <DateInput locale="en-US" onValueChange={onValueChange} />
  )
  segment(container, "month").focus()
  await type("11042026")
  expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([
    "2026-11-04",
  ])
  expect(shown(container)).toBe("11/04/2026")
  expect(
    container.querySelector<HTMLInputElement>('input[type="hidden"]')!.value
  ).toBe("2026-11-04")
})

test("a controlled value follows its owner", async () => {
  function Controlled() {
    const [value, setValue] = React.useState<string | null>("09:30")
    return (
      <>
        <TimeInput
          value={value}
          onValueChange={setValue}
          hourCycle={24}
          locale="en-US"
        />
        <output>{value}</output>
      </>
    )
  }
  const container = await render(<Controlled />)
  segment(container, "minute").focus()
  await React.act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      })
    )
  })
  expect(container.querySelector("output")!.textContent).toBe("09:31")
  expect(segment(container, "minute").value).toBe("31")
})

test("a field's label names the group and focuses its first segment", async () => {
  const container = await render(
    <Field>
      <FieldLabel>Start date</FieldLabel>
      <DateInput locale="en-US" />
    </Field>
  )
  const group = container.querySelector('[role="group"]')!
  const label = container.querySelector("label")!
  expect(group.getAttribute("aria-labelledby")).toContain(label.id)
  await React.act(async () => label.click())
  expect(document.activeElement).toBe(segment(container, "month"))
})

test("children can render the segments themselves", async () => {
  const container = await render(
    <DateInput defaultValue="2026-11-02" locale="en-US">
      {({ segments }) =>
        segments.map((item) => (
          <DateInputSegment
            key={item.key}
            segment={item}
            className={`segment-${item.type}`}
          />
        ))
      }
    </DateInput>
  )
  expect(container.querySelector(".segment-month")).toBe(
    segment(container, "month")
  )
  expect(container.querySelector(".segment-literal")!.textContent).toBe("/")
})
