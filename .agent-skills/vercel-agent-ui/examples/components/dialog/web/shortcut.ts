import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import { createElement, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger shortcut="mod+j">
        <button>
          ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
          New Contact
          <ui-dialog-shortcut></ui-dialog-shortcut>
        </button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>New contact</ui-dialog-title>
          <ui-dialog-description>Add someone to your address book.</ui-dialog-description>
        </div>
        <form data-slot="stack" method="dialog">
          <ui-field>
            <ui-field-label>Name</ui-field-label>
            <ui-input>
              <input name="name" required placeholder="Kofi Mensah" />
            </ui-input>
          </ui-field>
          <ui-field>
            <ui-field-label>Email</ui-field-label>
            <ui-input>
              <input name="email" type="email" required placeholder="kofi@example.com" />
            </ui-input>
          </ui-field>
          <div data-slot="row">
            <ui-dialog-close>
              <button type="button">Cancel</button>
            </ui-dialog-close>
            <button data-variant="solid" type="submit" value="save">Save Contact</button>
          </div>
        </form>
      </ui-dialog-content>
    </ui-dialog>
  `
}

export { mount }
