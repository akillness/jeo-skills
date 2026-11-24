// @vitest-environment jsdom
// A dialog's Close action and a toast's buttons hear how they were pressed,
// like Button's handler, for the changes they make after an `await`.
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, type App } from "vue"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  type DialogCloseActionDetails,
} from "../src/dialog"
import { withSource } from "../src/observe"
import { createToaster, ToastRegion } from "../src/toast"

// jsdom has no Web Animations API, which closing a popup asks for, and no
// ResizeObserver, which a toast measures itself with.
Element.prototype.getAnimations ??= () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let app: App | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(render: () => ReturnType<typeof h>) {
  app = createApp({ render })
  app.mount(document.body.appendChild(document.createElement("div")))
}

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name
  )!

test("a dialog's Close action, bound with @action, hears how it was pressed", async () => {
  const sources: string[] = []
  mount(() =>
    h(Dialog, { defaultOpen: true }, () =>
      h(DialogContent, null, () => [
        h(DialogTitle, null, () => "Draft"),
        h(
          DialogClose,
          {
            onAction: (
              _event: Event | undefined,
              { source }: DialogCloseActionDetails
            ) => sources.push(source),
          },
          () => "Save"
        ),
      ])
    )
  )
  await nextTick()
  withSource("agent", () => buttonNamed("Save").click())
  expect(sources).toEqual(["agent"])
})

test("a toast's action and cancel buttons hear how they were pressed", async () => {
  const sources: string[] = []
  const toaster = createToaster()
  mount(() => h(ToastRegion, { toaster }))
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
  await nextTick()
  withSource("agent", () => buttonNamed("Undo").click())
  withSource("keyboard", () => buttonNamed("Keep").click())
  expect(sources).toEqual(["undo:agent", "keep:keyboard"])
})
