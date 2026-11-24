// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { Input } from "../src/input"
import { Textarea } from "../src/textarea"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve)))

function Controlled({
  Control,
  reasons,
  keep = false,
}: {
  Control: typeof Input | typeof Textarea
  reasons: string[]
  keep?: boolean
}) {
  const [value, setValue] = React.useState("start")
  return (
    <Control
      aria-label="Name"
      value={value}
      defaultValue="start"
      onValueChange={(next, details) => {
        reasons.push(details.reason)
        if (keep && details.reason === "reset") {
          details.cancel()
          return
        }
        setValue(next)
      }}
    />
  )
}

async function typeAndReset(ui: React.ReactNode) {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  act(() => root!.render(<form>{ui}</form>))
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea"
  )!
  act(() => {
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el),
      "value"
    )!.set!.call(el, "typed")
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await settle()
  el.form!.reset()
  await settle()
  return el
}

test.each([
  ["Input", Input],
  ["Textarea", Textarea],
] as const)(
  "a controlled %s with defaultValue returns to it on reset",
  async (_, Control) => {
    const reasons: string[] = []
    const el = await typeAndReset(
      <Controlled Control={Control} reasons={reasons} />
    )
    expect({ value: el.value, reasons }).toEqual({
      value: "start",
      reasons: ["input-change", "reset"],
    })
  }
)

test.each([
  ["Input", Input],
  ["Textarea", Textarea],
] as const)(
  "a controlled %s keeps its value when the reset is canceled",
  async (_, Control) => {
    const reasons: string[] = []
    const el = await typeAndReset(
      <Controlled Control={Control} reasons={reasons} keep />
    )
    expect({ value: el.value, reasons }).toEqual({
      value: "typed",
      reasons: ["input-change", "reset"],
    })
  }
)

test("an uncontrolled Input returns to its defaultValue on reset", async () => {
  const reasons: string[] = []
  const el = await typeAndReset(
    <Input
      aria-label="Name"
      defaultValue="start"
      onValueChange={(_, details) => reasons.push(details.reason)}
    />
  )
  expect({ value: el.value, reasons }).toEqual({
    value: "start",
    reasons: ["input-change", "reset"],
  })
})

test("a controlled Input with no defaultValue keeps its value on reset", async () => {
  function Bare() {
    const [value, setValue] = React.useState("start")
    return <Input aria-label="Name" value={value} onValueChange={setValue} />
  }
  const el = await typeAndReset(<Bare />)
  expect(el.value).toBe("typed")
})
