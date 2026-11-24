// @vitest-environment jsdom
import { definePrimitive } from "@ui-sdk/core"
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { usePart, usePrimitive } from "../src/primitive"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const heard: string[] = []
const probe = definePrimitive({
  name: "probe",
  state: (_options: {}) => ({}),
  api: () => ({}),
  slots: (slot) => ({
    root: slot({
      on: {
        focus: () => heard.push("focus"),
        blur: () => heard.push("blur"),
        wheel: () => heard.push("wheel"),
        keydown: () => heard.push("keydown"),
      },
    }),
  }),
})

function Probe() {
  return usePart(
    usePrimitive(probe, {}),
    "root",
    {},
    { children: "Probe" },
    "button"
  )
}

test("a slot's handlers run for event types React has no prop mapping for", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Probe />))
  const button = container.querySelector("button")!
  button.focus()
  button.dispatchEvent(new WheelEvent("wheel", { bubbles: true }))
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", bubbles: true })
  )
  button.blur()
  expect(heard).toEqual(["focus", "wheel", "keydown", "blur"])
})
