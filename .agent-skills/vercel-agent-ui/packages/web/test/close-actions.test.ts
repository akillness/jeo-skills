// @vitest-environment jsdom
// A dialog's Close part and a toast's buttons hear how they were pressed, like
// `<ui-button>`, for the changes a listener makes after an `await`.
import { afterEach, expect, test } from "vitest"
import type { UiActionDetail } from "../src/action"
import { defineDialogElements } from "../src/dialog"
import type { UiToastRegionElement } from "../src/events"
import { withSource } from "../src/observe"
import { createToaster, defineToastElements } from "../src/toast"

// jsdom has no Web Animations API, which closing a popup asks for, and no
// ResizeObserver, which a toast measures itself with.
Element.prototype.getAnimations ??= () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

afterEach(() => document.body.replaceChildren())

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (button) => button.textContent === name
  )!

// Records the source of each `action` event `el` fires, which doesn't bubble.
function listen(el: Element, sources: string[]) {
  el.addEventListener("action", (event) => {
    sources.push(
      `${el.localName}:${(event as CustomEvent<UiActionDetail>).detail.source}`
    )
  })
}

test("a dialog's Close part with an action attribute says how it was pressed", async () => {
  defineDialogElements()
  document.body.innerHTML = `
    <ui-dialog open>
      <ui-dialog-content>
        <ui-dialog-title>Draft</ui-dialog-title>
        <ui-dialog-close action><button>Save</button></ui-dialog-close>
      </ui-dialog-content>
    </ui-dialog>`
  await wait()
  const sources: string[] = []
  listen(document.querySelector("ui-dialog-close")!, sources)
  withSource("agent", () => buttonNamed("Save").click())
  expect(sources).toEqual(["ui-dialog-close:agent"])
})

test("a toast's action event and its cancel say how they were pressed", async () => {
  defineToastElements()
  document.body.innerHTML = `
    <ui-toast-region>
      <template>
        <ui-toast>
          <ui-toast-title></ui-toast-title>
          <ui-toast-action action><button>Undo</button></ui-toast-action>
          <ui-toast-close><button></button></ui-toast-close>
        </ui-toast>
      </template>
    </ui-toast-region>`
  const sources: string[] = []
  const toaster = createToaster()
  const region = document.querySelector(
    "ui-toast-region"
  ) as UiToastRegionElement
  region.toaster = toaster
  toaster("Deleted", {
    duration: Infinity,
    cancel: {
      label: "Keep",
      onCancel: (_event, { source }) => sources.push(`cancel:${source}`),
    },
  })
  await wait()
  listen(region.querySelector("ol ui-toast-action")!, sources)
  // Either press closes the toast, so both buttons are found first.
  const [undo, keep] = [buttonNamed("Undo"), buttonNamed("Keep")]
  withSource("agent", () => undo.click())
  withSource("keyboard", () => keep.click())
  expect(sources).toEqual(["ui-toast-action:agent", "cancel:keyboard"])
})
