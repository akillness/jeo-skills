// A dialog or drawer its parent opens through `open` writes no state of its
// own while Solid hands the option over, and without a title a dialog is named
// after its trigger.
import { render } from "@solidjs/web"
import { createSignal, flush, type Accessor, type JSX } from "solid-js"
import { afterEach, expect, test } from "vitest"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTrigger,
} from "../src/alert-dialog"
import { Dialog, DialogContent, DialogTrigger } from "../src/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  type DrawerContentState,
} from "../src/drawer"

// jsdom has no top layer, and no ResizeObserver, which a drawer measures itself with.
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

// What core's development build recorded writing while options were handed over.
const relays = () =>
  (globalThis as Record<symbol, { relays?: unknown[] } | undefined>)[
    Symbol.for("ui-sdk.devtools.history@1")
  ]?.relays ?? []

const dialogs: Record<string, (open: Accessor<boolean>) => JSX.Element> = {
  dialog: (open) => (
    <Dialog open={open()}>
      <DialogTrigger>Edit profile</DialogTrigger>
      <DialogContent>Body</DialogContent>
    </Dialog>
  ),
  "alert dialog": (open) => (
    <AlertDialog open={open()}>
      <AlertDialogTrigger>Edit profile</AlertDialogTrigger>
      <AlertDialogContent>Body</AlertDialogContent>
    </AlertDialog>
  ),
}

for (const [name, view] of Object.entries(dialogs)) {
  test(`an untitled ${name} opened through its prop is named after its trigger and records no relays`, async () => {
    relays().splice(0)
    const [open, setOpen] = createSignal(false)
    dispose = render(
      () => view(open),
      document.body.appendChild(document.createElement("div"))
    )
    flush()
    setOpen(true)
    flush()
    await new Promise((done) => setTimeout(done))
    flush()
    const content = document.querySelector(
      '[role="dialog"], [role="alertdialog"]'
    )!
    expect(content.getAttribute("aria-label")).toBe("Edit profile")
    expect(relays()).toEqual([])
  })
}

test("a drawer opened through its prop records no relays and opens at its default snap point each time", async () => {
  relays().splice(0)
  const [open, setOpen] = createSignal(false)
  dispose = render(
    () => (
      <Drawer open={open()}>
        <DrawerTrigger>Edit profile</DrawerTrigger>
        <DrawerContent>Body</DrawerContent>
      </Drawer>
    ),
    document.body.appendChild(document.createElement("div"))
  )
  const settle = async () => {
    flush()
    await new Promise((done) => setTimeout(done))
    flush()
  }
  for (const _ of [1, 2]) {
    setOpen(true)
    await settle()
    expect(
      document.querySelector('[role="dialog"]')!.getAttribute("data-snap-point")
    ).toBe("content")
    setOpen(false)
    await settle()
  }
  expect(relays()).toEqual([])
})

test("a drawer opened with new snap points renders at the first of them, as modal as it is there, at once", async () => {
  relays().splice(0)
  const [open, setOpen] = createSignal(false)
  const [snapPoints, setSnapPoints] = createSignal([0.5, 1])
  const rendered: string[] = []
  dispose = render(
    () => (
      <Drawer open={open()} snapPoints={snapPoints()} modalAbove={0.25}>
        <DrawerTrigger>Edit profile</DrawerTrigger>
        <DrawerContent
          class={(state: DrawerContentState) => {
            rendered.push(`${state.snapPoint} ${state.modal}`)
            return "content"
          }}
        >
          Body
        </DrawerContent>
      </Drawer>
    ),
    document.body.appendChild(document.createElement("div"))
  )
  flush()
  setSnapPoints([0.25, 1])
  setOpen(true)
  flush()
  expect(rendered[0]).toBe("0.25 false")
  expect(relays()).toEqual([])
})
