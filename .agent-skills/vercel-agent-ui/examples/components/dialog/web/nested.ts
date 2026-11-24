import "@ui-sdk/web/dialog"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger>
        <button>Account</button>
      </ui-dialog-trigger>
      <ui-dialog-backdrop hidden></ui-dialog-backdrop>
      <ui-dialog-content hidden>
        <div data-slot="stack">
          <ui-dialog-title>Account</ui-dialog-title>
          <ui-dialog-description>Manage how you sign in.</ui-dialog-description>
        </div>
        <div data-slot="card">
          <div data-slot="stack">
            <span>Password</span>
            <span data-slot="hint">Last changed 3 months ago</span>
          </div>
          <ui-dialog>
            <ui-dialog-trigger>
              <button>Change Password</button>
            </ui-dialog-trigger>
            <ui-dialog-backdrop hidden></ui-dialog-backdrop>
            <ui-dialog-content hidden>
              <div data-slot="stack">
                <ui-dialog-title>Change password</ui-dialog-title>
                <ui-dialog-description>Use at least 12 characters.</ui-dialog-description>
              </div>
              <ui-field>
                <ui-field-label>New password</ui-field-label>
                <ui-input>
                  <input type="password" />
                </ui-input>
              </ui-field>
              <div data-slot="row">
                <ui-dialog-close>
                  <button>Cancel</button>
                </ui-dialog-close>
                <ui-dialog-close>
                  <button data-variant="solid">Update</button>
                </ui-dialog-close>
              </div>
            </ui-dialog-content>
          </ui-dialog>
        </div>
        <div data-slot="row">
          <ui-dialog-close>
            <button data-variant="solid">Done</button>
          </ui-dialog-close>
        </div>
      </ui-dialog-content>
    </ui-dialog>
  `
}

export { mount }
