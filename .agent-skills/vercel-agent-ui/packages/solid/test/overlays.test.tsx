import { createConfirm } from "@ui-sdk/core/dialog"
import { createOverlays } from "@ui-sdk/core/overlays"
import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { afterEach, expect, test } from "vitest"
import { OverlayHost } from "../src/overlays"

HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

const wait = () => new Promise((resolve) => setTimeout(resolve, 50))

afterEach(() => document.body.replaceChildren())

function mountHost(overlays: ReturnType<typeof createOverlays>) {
  const container = document.body.appendChild(document.createElement("div"))
  return render(() => <OverlayHost overlays={overlays} />, container)
}

test("an overlay host unmounted before its confirm opens answers it with no, and asks the next", async () => {
  const overlays = createOverlays()
  const dispose = mountHost(overlays)
  const confirm = createConfirm({ overlays })
  let answer: boolean | undefined
  confirm({ title: "Delete the file?" }).then((value) => (answer = value))
  await Promise.resolve()
  flush()
  dispose()
  await wait()
  expect(answer).toBe(false)
  const next = mountHost(overlays)
  confirm({ title: "Discard the draft?" })
  await wait()
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Discard the draft?"
  )
  next()
})
