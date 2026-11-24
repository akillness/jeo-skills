import {
  createConfirm,
  type UiAlertDialogElement,
} from "@ui-sdk/web/alert-dialog"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <button type="button">Review Two Projects</button>
      <ui-alert-dialog>
        <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
        <ui-alert-dialog-content hidden>
          <div data-slot="stack">
            <ui-alert-dialog-title></ui-alert-dialog-title>
            <ui-alert-dialog-description>
              Archived projects leave the active list. You can restore them later.
            </ui-alert-dialog-description>
          </div>
          <div data-slot="row">
            <ui-alert-dialog-close>
              <button>Cancel</button>
            </ui-alert-dialog-close>
            <ui-alert-dialog-close value="confirm">
              <button data-variant="solid">Archive</button>
            </ui-alert-dialog-close>
          </div>
        </ui-alert-dialog-content>
      </ui-alert-dialog>
    </div>
  `
  const confirm = createConfirm<{ name: string }>()
  const dialog =
    root.querySelector<UiAlertDialogElement<{ name: string }>>(
      "ui-alert-dialog"
    )!
  const title = root.querySelector("ui-alert-dialog-title")!
  dialog.controller = confirm.controller
  dialog.addEventListener("payloadchange", (event) => {
    title.textContent = `Archive ${event.detail.value?.name}?`
  })
  root.querySelector("button")!.addEventListener("click", async () => {
    const acme = confirm({ name: "Acme" })
    const globex = confirm({ name: "Globex" })
    const [first, second] = await Promise.all([acme, globex])
    log(root, `Acme: ${first ? "confirmed" : "canceled"}`)
    log(root, `Globex: ${second ? "confirmed" : "canceled"}`)
  })
}

export { mount }
