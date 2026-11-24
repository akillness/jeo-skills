// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, expect, test } from "vitest"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "../src/field"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const texts = (el: Element) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)

test("each description gets an id of its own, and the control names them all", async () => {
  const app = (
    <Field>
      <FieldDescription>First</FieldDescription>
      <FieldControl />
      <FieldDescription>Second</FieldDescription>
    </Field>
  )
  const server = document.createElement("div")
  server.innerHTML = renderToString(app)
  const serverInput = server.querySelector("input")!
  expect(
    server.querySelector(
      `#${CSS.escape(serverInput.getAttribute("aria-describedby")!)}`
    )?.textContent
  ).toBe("First")

  const container = document.body.appendChild(document.createElement("div"))
  await React.act(async () => {
    root = createRoot(container)
    root.render(app)
  })
  await React.act(() => new Promise((resolve) => setTimeout(resolve, 20)))
  const ids = [
    ...container.querySelectorAll('[data-slot="field-description"]'),
  ].map((el) => el.id)
  expect(new Set(ids).size).toBe(2)
  expect(texts(container.querySelector("input")!)).toEqual(["First", "Second"])
})

test("each description of a field set gets an id of its own", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  await React.act(async () => {
    root = createRoot(container)
    root.render(
      <FieldSet>
        <FieldLegend>Address</FieldLegend>
        <FieldDescription>First</FieldDescription>
        <FieldDescription>Second</FieldDescription>
      </FieldSet>
    )
  })
  await React.act(() => new Promise((resolve) => setTimeout(resolve, 20)))
  expect(texts(container.querySelector("fieldset")!)).toEqual([
    "First",
    "Second",
  ])
})
