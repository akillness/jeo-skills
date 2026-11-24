// @vitest-environment jsdom
// A listener that cancels an `action` event cancels what its part does next.
import { dialog } from "@ui-sdk/core/dialog"
import { press } from "@ui-sdk/core/renderer"
import { expect, test } from "vitest"
import { actionOf, type UiActionDetail } from "../src/action"

test("canceling a Close part's action event keeps its dialog open", () => {
  const instance = dialog({ id: "d", defaultOpen: true })
  const close = document.createElement("ui-dialog-close")
  close.addEventListener("action", (event) => event.preventDefault())
  press(instance.part("close", { id: "close", action: actionOf(close) }))?.()
  expect(instance.get().open).toBe(true)
})

test("waitUntil() after the action event dispatched throws, like ExtendableEvent's", () => {
  const button = document.createElement("ui-button")
  let late: (() => void) | undefined
  button.addEventListener("action", (event) => {
    const { waitUntil } = (event as CustomEvent<UiActionDetail>).detail
    late = () => waitUntil(Promise.resolve())
  })
  actionOf(button)(undefined, { source: "mouse" })
  expect(late).toThrow(expect.objectContaining({ name: "InvalidStateError" }))
})
