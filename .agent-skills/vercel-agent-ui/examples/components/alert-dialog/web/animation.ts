import "@ui-sdk/web/alert-dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-alert-dialog>
      <ui-alert-dialog-trigger>
        <button>Leave Workspace</button>
      </ui-alert-dialog-trigger>
      <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
      <ui-alert-dialog-content hidden>
        <div data-slot="stack">
          <ui-alert-dialog-title>Leave this workspace?</ui-alert-dialog-title>
          <ui-alert-dialog-description>
            You'll lose access to its projects until someone invites you again.
          </ui-alert-dialog-description>
        </div>
        <div data-slot="row">
          <ui-alert-dialog-close>
            <button>Cancel</button>
          </ui-alert-dialog-close>
          <ui-alert-dialog-close value="confirm">
            <button data-variant="solid">Leave</button>
          </ui-alert-dialog-close>
        </div>
      </ui-alert-dialog-content>
    </ui-alert-dialog>
  `
}

export { mount }
