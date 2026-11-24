import "@ui-sdk/web/dialog"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger>
        <button>Slide In</button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content keep-mounted hidden>
        <div data-slot="stack">
          <ui-dialog-title>Slide and fade</ui-dialog-title>
          <ui-dialog-description>300ms in and out. Focus returns as soon as it starts closing.</ui-dialog-description>
        </div>
        <div data-slot="row">
          <ui-dialog-close>
            <button data-variant="solid">Close</button>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
  root
    .querySelector("ui-dialog")!
    .addEventListener("openchangecomplete", (event) => {
      log(root, event.detail.value ? "Finished opening" : "Finished closing")
    })
}

export { mount }
