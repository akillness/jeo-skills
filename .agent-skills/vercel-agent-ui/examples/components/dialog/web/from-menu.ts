import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/menu"
import { Copy, createElement, Ellipsis, Pencil } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button aria-label="File actions">${createElement(Ellipsis, { "aria-hidden": "true" }).outerHTML}</button>
      </ui-menu-trigger>
      <ui-menu-content hidden>
        <ui-menu-item value="rename">
          ${createElement(Pencil, { "aria-hidden": "true" }).outerHTML}
          Rename…
        </ui-menu-item>
        <ui-menu-item value="duplicate">
          ${createElement(Copy, { "aria-hidden": "true" }).outerHTML}
          Duplicate
        </ui-menu-item>
      </ui-menu-content>
    </ui-menu>
    <ui-dialog>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>Rename file</ui-dialog-title>
          <ui-dialog-description>Names must be unique in a folder.</ui-dialog-description>
        </div>
        <ui-field>
          <ui-field-label>Name</ui-field-label>
          <ui-input>
            <input value="report.pdf" />
          </ui-input>
        </ui-field>
        <div data-slot="row">
          <ui-dialog-close>
            <button>Cancel</button>
          </ui-dialog-close>
          <ui-dialog-close value="rename">
            <button data-variant="solid">Rename</button>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
  const dialog = root.querySelector("ui-dialog")!
  root.querySelector("ui-menu")!.addEventListener("action", (event) => {
    if (event.detail.value === "rename") {
      dialog.api.open()
    }
  })
}

export { mount }
