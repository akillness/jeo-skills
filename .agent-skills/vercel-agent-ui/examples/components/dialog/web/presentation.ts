import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog presentation="sheet">
      <ui-dialog-trigger>
        <button>Edit Profile</button>
      </ui-dialog-trigger>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>Edit profile</ui-dialog-title>
          <ui-dialog-description>Make changes to your profile here. Save when you're done.</ui-dialog-description>
        </div>
        <ui-field>
          <ui-field-label>Name</ui-field-label>
          <ui-input>
            <input value="Hollis Grant" />
          </ui-input>
        </ui-field>
        <ui-field>
          <ui-field-label>Username</ui-field-label>
          <ui-input>
            <input value="@hollis" />
          </ui-input>
        </ui-field>
        <div data-slot="row">
          <ui-dialog-close>
            <button>Cancel</button>
          </ui-dialog-close>
          <ui-dialog-close value="save">
            <button data-variant="solid">Save Changes</button>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
}

export { mount }
