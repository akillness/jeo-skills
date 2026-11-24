import "@ui-sdk/web/alert-dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-alert-dialog>
      <ui-alert-dialog-trigger>
        <button>Delete Workspace</button>
      </ui-alert-dialog-trigger>
      <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
      <ui-alert-dialog-content hidden>
        <div data-slot="stack">
          <ui-alert-dialog-title>Delete this workspace?</ui-alert-dialog-title>
          <ui-alert-dialog-description>
            All 12 projects and their deployments will be deleted for everyone on your team.
          </ui-alert-dialog-description>
        </div>
        <div data-slot="row">
          <ui-alert-dialog-close>
            <button>Cancel</button>
          </ui-alert-dialog-close>
          <ui-alert-dialog>
            <ui-alert-dialog-trigger>
              <button data-variant="solid">Delete</button>
            </ui-alert-dialog-trigger>
            <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
            <ui-alert-dialog-content hidden>
              <div data-slot="stack">
                <ui-alert-dialog-title>Are you absolutely sure?</ui-alert-dialog-title>
                <ui-alert-dialog-description>There's no way to get the workspace back.</ui-alert-dialog-description>
              </div>
              <div data-slot="row">
                <ui-alert-dialog-close>
                  <button>Go Back</button>
                </ui-alert-dialog-close>
                <ui-alert-dialog-close value="confirm">
                  <button data-variant="solid">Delete Workspace</button>
                </ui-alert-dialog-close>
              </div>
            </ui-alert-dialog-content>
          </ui-alert-dialog>
        </div>
      </ui-alert-dialog-content>
    </ui-alert-dialog>
  `
  const [outer, inner] = root.querySelectorAll("ui-alert-dialog")
  inner.addEventListener("openchange", (event) => {
    if (!event.detail.value && event.detail.returnValue === "confirm") {
      outer.open = false
    }
  })
}

export { mount }
