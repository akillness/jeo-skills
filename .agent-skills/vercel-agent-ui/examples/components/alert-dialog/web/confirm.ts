import {
  createConfirm,
  type UiAlertDialogElement,
} from "@ui-sdk/web/alert-dialog"

const names = ["Acme", "Globex", "Initech"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Reset Projects</button>
      </div>
      <ul data-slot="list" aria-label="Projects"></ul>
      <ui-alert-dialog>
        <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
        <ui-alert-dialog-content hidden>
          <div data-slot="stack">
            <ui-alert-dialog-title></ui-alert-dialog-title>
            <ui-alert-dialog-description>
              The project and its files will be deleted for everyone on your team.
            </ui-alert-dialog-description>
          </div>
          <div data-slot="row">
            <ui-alert-dialog-close>
              <button>Cancel</button>
            </ui-alert-dialog-close>
            <ui-alert-dialog-close value="confirm">
              <button data-variant="solid">Delete</button>
            </ui-alert-dialog-close>
          </div>
        </ui-alert-dialog-content>
      </ui-alert-dialog>
    </div>
  `
  const confirm = createConfirm<{ name: string }>()
  const dialog =
    root.querySelector<UiAlertDialogElement<{ name: string }>>(
      "ui-alert-dialog"
    )!
  const title = root.querySelector("ui-alert-dialog-title")!
  const list = root.querySelector("ul")!
  const reset = root.querySelector("button")!
  dialog.controller = confirm.controller
  dialog.addEventListener("payloadchange", (event) => {
    title.textContent = `Delete ${event.detail.value?.name}?`
  })

  function resetProjects() {
    list.innerHTML = names
      .map(
        (name) =>
          `<li data-slot="row">${name}<button type="button" data-size="sm" aria-label="Delete ${name}">Delete</button></li>`
      )
      .join("")
    for (const [index, row] of list.querySelectorAll("li").entries()) {
      const name = names[index]
      row.querySelector("button")!.addEventListener("click", async () => {
        if (!(await confirm({ name }))) {
          return
        }
        const next = (
          row.nextElementSibling ?? row.previousElementSibling
        )?.querySelector("button")
        const target = next ?? reset
        target.focus()
        row.remove()
        if (!list.children.length) {
          list.innerHTML = `<li data-slot="row">All projects deleted.</li>`
        }
      })
    }
  }
  reset.addEventListener("click", resetProjects)
  resetProjects()
}

export { mount }
