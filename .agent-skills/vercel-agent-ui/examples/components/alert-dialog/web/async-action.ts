import "@ui-sdk/web/alert-dialog"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-alert-dialog pending-announcement="Deleting project">
        <ui-alert-dialog-trigger>
          <button>Delete Project</button>
        </ui-alert-dialog-trigger>
        <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
        <ui-alert-dialog-content hidden>
          <div data-slot="stack">
            <ui-alert-dialog-title>Delete project?</ui-alert-dialog-title>
            <ui-alert-dialog-description>
              This permanently deletes the project, its files and its deployment history for everyone on your team.
            </ui-alert-dialog-description>
          </div>
          <div data-slot="stack">
            <p data-slot="hint" role="alert"></p>
            <div data-slot="row">
              <ui-alert-dialog-close>
                <button>Cancel</button>
              </ui-alert-dialog-close>
              <ui-alert-dialog-close action value="confirm">
                <button data-variant="solid">Delete</button>
              </ui-alert-dialog-close>
            </div>
          </div>
        </ui-alert-dialog-content>
      </ui-alert-dialog>
    </div>
  `
  let attempts = 0
  const dialog = root.querySelector("ui-alert-dialog")!
  const close = root.querySelector("ui-alert-dialog-close[action]")!
  const button = close.querySelector("button")!
  const message = root.querySelector("p")!

  async function deleteProject() {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    if (attempts++ === 0) {
      throw new Error("Couldn't delete the project.")
    }
  }

  close.addEventListener("action", (event) => {
    const { waitUntil } = (
      event as CustomEvent<{ waitUntil: (promise: Promise<unknown>) => void }>
    ).detail
    button.textContent = "Deleting…"
    message.textContent = ""
    const deleting = deleteProject()
    waitUntil(deleting)
    deleting.then(
      () => {
        button.textContent = "Delete"
      },
      (error: Error) => {
        button.textContent = "Try Again"
        message.textContent = error.message
      }
    )
  })
  dialog.addEventListener("openchange", (event) => {
    if (!event.detail.value) {
      return
    }
    button.textContent = "Delete"
    message.textContent = ""
  })
}

export { mount }
