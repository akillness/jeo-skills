// @vitest-environment jsdom
// A dialog's Close action and a toast's buttons hear how they were pressed,
// like Button's handler, for the changes they make after an `await`.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../src/dialog"
import { withSource } from "../src/observe"
import { createToaster, ToastRegion } from "../src/toast"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no Web Animations API, which closing a popup asks for, and no
// ResizeObserver, which a toast measures itself with.
Element.prototype.getAnimations ??= () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

async function mount(element: React.ReactNode) {
  const host = document.body.appendChild(document.createElement("div"))
  root = createRoot(host)
  await React.act(async () => root!.render(element))
}

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name
  )!

test("a dialog's Close action hears how it was pressed", async () => {
  const sources: string[] = []
  await mount(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogTitle>Draft</DialogTitle>
        <DialogClose action={(_event, { source }) => sources.push(source)}>
          Save
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
  await React.act(async () =>
    withSource("agent", () => buttonNamed("Save").click())
  )
  expect(sources).toEqual(["agent"])
})

test("a toast's action and cancel buttons hear how they were pressed", async () => {
  const sources: string[] = []
  const toaster = createToaster()
  await mount(<ToastRegion toaster={toaster} />)
  await React.act(async () => {
    toaster("Deleted", {
      duration: Infinity,
      action: {
        label: "Undo",
        onAction: (_event, { source }) => sources.push(`undo:${source}`),
      },
    })
    toaster("Saved", {
      duration: Infinity,
      cancel: {
        label: "Keep",
        onCancel: (_event, { source }) => sources.push(`keep:${source}`),
      },
    })
  })
  await React.act(async () =>
    withSource("agent", () => buttonNamed("Undo").click())
  )
  await React.act(async () =>
    withSource("keyboard", () => buttonNamed("Keep").click())
  )
  expect(sources).toEqual(["undo:agent", "keep:keyboard"])
})
