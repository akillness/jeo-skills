import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { Field, FieldDescription } from "../src/field"
import { Input } from "../src/input"

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

test("each description gets an id of its own, and the control names them all", async () => {
  const el = document.body.appendChild(document.createElement("div"))
  dispose = render(
    () => (
      <Field>
        <FieldDescription>First</FieldDescription>
        <Input />
        <FieldDescription>Second</FieldDescription>
      </Field>
    ),
    el
  )
  flush()
  await new Promise((resolve) => setTimeout(resolve, 20))
  flush()
  const names = el
    .querySelector("input")!
    .getAttribute("aria-describedby")!
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent)
  expect(names).toEqual(["First", "Second"])
})
