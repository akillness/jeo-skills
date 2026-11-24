import "@ui-sdk/web/alert-dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-alert-dialog>
      <ui-alert-dialog-trigger shortcut="mod+shift+h">
        <button>
          Clear History
          <ui-alert-dialog-shortcut></ui-alert-dialog-shortcut>
        </button>
      </ui-alert-dialog-trigger>
      <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
      <ui-alert-dialog-content hidden>
        <div data-slot="stack">
          <ui-alert-dialog-title>Clear your history?</ui-alert-dialog-title>
          <ui-alert-dialog-description>
            Recent searches and visited pages are removed from this device.
          </ui-alert-dialog-description>
        </div>
        <div data-slot="row">
          <ui-alert-dialog-close>
            <button>Cancel</button>
          </ui-alert-dialog-close>
          <ui-alert-dialog-close value="confirm">
            <button data-variant="solid">Clear</button>
          </ui-alert-dialog-close>
        </div>
      </ui-alert-dialog-content>
    </ui-alert-dialog>
  `
}

export { mount }
