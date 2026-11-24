import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { createElement, X } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger>
        <button>Share</button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>Share link</ui-dialog-title>
          <ui-dialog-description>Anyone who has this link will be able to view this.</ui-dialog-description>
        </div>
        <ui-field>
          <ui-field-label>Link</ui-field-label>
          <ui-input>
            <input value="https://example.com/project" readonly />
          </ui-input>
        </ui-field>
        <div data-slot="row">
          <ui-dialog-close>
            <button data-variant="solid">Done</button>
          </ui-dialog-close>
        </div>
        <ui-dialog-close>
          <button aria-label="Close">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-dialog-close>
      </ui-dialog-content>
    </ui-dialog>
  `
}

export { mount }
