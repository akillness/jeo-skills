// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Field, FieldControl, FieldError } from "../src/field"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

let root: Root | undefined
const container = () => document.body.firstElementChild as HTMLElement

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

function Errors({
  mode,
  shown,
}: {
  mode: "visible" | "hidden"
  shown: [boolean, boolean]
}) {
  return (
    <React.StrictMode>
      <Field invalid>
        <FieldControl />
        <React.Activity mode={mode}>
          <FieldError match={shown[0]}>A</FieldError>
        </React.Activity>
        <FieldError match={shown[1]}>B</FieldError>
      </Field>
    </React.StrictMode>
  )
}

const described = () => {
  const ids = [
    ...container().querySelectorAll('[data-slot="field-error"]'),
  ].map((error) => error.id)
  const names = (
    container().querySelector("input")!.getAttribute("aria-describedby") ?? ""
  )
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
  return { ids, names }
}

const settle = () =>
  React.act(() => new Promise((resolve) => setTimeout(resolve, 100)))

test("errors keep their own ids and descriptions as they flip or hide", async () => {
  const steps: [React.ComponentProps<typeof Errors>, string[]][] = [
    [{ mode: "visible", shown: [true, true] }, ["A", "B"]],
    [{ mode: "hidden", shown: [true, true] }, ["B"]],
    [{ mode: "visible", shown: [true, true] }, ["A", "B"]],
    [{ mode: "visible", shown: [false, true] }, ["B"]],
    [{ mode: "visible", shown: [true, true] }, ["A", "B"]],
  ]
  document.body.append(document.createElement("div"))
  root = createRoot(container())
  for (const [props, names] of steps) {
    await React.act(async () => root!.render(<Errors {...props} />))
    await settle()
    const state = described()
    expect(new Set(state.ids).size, JSON.stringify(props)).toBe(
      state.ids.length
    )
    expect([...state.names].sort(), JSON.stringify(props)).toEqual(names)
  }
})
