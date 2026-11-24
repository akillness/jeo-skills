// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { definePrimitive } from "@ui-sdk/core"
import { usePart, usePrimitive, type PrimitiveHandle } from "../src/primitive"

// A part whose presence reads live state, which bumps no version, still
// mounts and unmounts as that state changes.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const hover = definePrimitive({
  name: "live-presence",
  state: (_options: {}) => ({ hovered: null as string | null }),
  live: ["hovered"],
  api: ({ store }) => ({
    hover: (hovered: string | null) => store.set({ hovered }),
  }),
  slots: (slot) => ({
    card: slot({ present: (state) => state.hovered !== null }),
  }),
})

let root: Root | undefined
let handle: PrimitiveHandle<typeof hover> | undefined

function Card() {
  return usePart(handle!, "card", {}, { children: "Card" })
}

function Example() {
  handle = usePrimitive(hover, {})
  return <Card />
}

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("a part shows and hides from live state", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  await React.act(async () => root!.render(<Example />))
  expect(container.textContent).toBe("")
  await React.act(async () => handle!.api.hover("a"))
  expect(container.textContent).toBe("Card")
  await React.act(async () => handle!.api.hover(null))
  expect(container.textContent).toBe("")
})
