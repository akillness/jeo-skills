import "@ui-sdk/web/alert-dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <button type="button" aria-haspopup="dialog">Review Changes</button>
      <ui-alert-dialog>
        <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
        <ui-alert-dialog-content hidden>
          <div data-slot="stack">
            <ui-alert-dialog-title>Discard unsaved changes?</ui-alert-dialog-title>
            <ui-alert-dialog-description>
              Your edits will be lost if you leave without saving.
            </ui-alert-dialog-description>
          </div>
          <div data-slot="row">
            <ui-alert-dialog-close>
              <button>Keep Editing</button>
            </ui-alert-dialog-close>
            <ui-alert-dialog-close value="confirm">
              <button data-variant="solid">Discard</button>
            </ui-alert-dialog-close>
          </div>
        </ui-alert-dialog-content>
      </ui-alert-dialog>
    </div>
  `
  const dialog = root.querySelector("ui-alert-dialog")!
  root.querySelector("button")!.addEventListener("click", () => {
    dialog.open = true
  })
}

export { mount }
