import "@ui-sdk/web/alert-dialog"
import "@ui-sdk/web/overlays"
import {
  createConfirm,
  createOverlays,
  createToaster,
  type ConfirmOptions,
  type UiAlertDialogElement,
} from "@ui-sdk/web"
import { CircleCheck, createElement } from "lucide"

const names = ["Acme", "Globex", "Initech"]

function mount(root: HTMLElement) {
  const overlays = createOverlays()
  const toast = createToaster({ overlays })
  const confirm = createConfirm({ overlays })
  let projects = names
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
            <ui-alert-dialog-description></ui-alert-dialog-description>
          </div>
          <div data-slot="row">
            <ui-alert-dialog-close><button></button></ui-alert-dialog-close>
            <ui-alert-dialog-close value="confirm"><button data-variant="solid"></button></ui-alert-dialog-close>
          </div>
        </ui-alert-dialog-content>
      </ui-alert-dialog>
    </div>
  `
  const reset = root.querySelector("button")!
  const list = root.querySelector("ul")!

  function render() {
    list.innerHTML = projects.length
      ? projects
          .map(
            (name) =>
              `<li data-slot="row">${name}<button type="button" data-size="sm" aria-label="Delete ${name}">Delete</button></li>`
          )
          .join("")
      : `<li data-slot="row">All projects deleted.</li>`
    list.querySelectorAll("button").forEach((button, index) => {
      const name = projects[index]
      button.addEventListener("click", () => remove(name, index))
    })
  }

  async function remove(name: string, index: number) {
    const confirmed = await confirm({
      title: `Delete ${name}?`,
      description:
        "The project and its files will be deleted for everyone on your team.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    })
    if (!confirmed) {
      return
    }
    projects = projects.filter((project) => project !== name)
    render()
    ;(
      list.querySelectorAll("button")[Math.min(index, projects.length - 1)] ??
      reset
    ).focus()
    toast.success(`${name} deleted`, { priority: "assertive" })
  }

  reset.addEventListener("click", () => {
    projects = names
    render()
  })
  render()

  const dialog =
    root.querySelector<UiAlertDialogElement<ConfirmOptions>>("ui-alert-dialog")!
  const [cancel, agree] = dialog.querySelectorAll("button")
  dialog.controller = confirm.controller
  dialog.addEventListener("payloadchange", (event) => {
    const question = event.detail.value
    dialog.querySelector("ui-alert-dialog-title")!.textContent =
      question?.title ?? ""
    dialog.querySelector("ui-alert-dialog-description")!.textContent =
      question?.description ?? ""
    cancel.textContent = question?.cancelLabel ?? ""
    agree.textContent = question?.confirmLabel ?? ""
  })

  const template = document.createElement("template")
  template.innerHTML = `
    <ui-toast>
      ${createElement(CircleCheck, { "data-show": "success", "aria-hidden": "true" }).outerHTML}
      <ui-toast-title></ui-toast-title>
    </ui-toast>
  `
  dialog.before(
    Object.assign(document.createElement("ui-overlay-host"), {
      overlays,
      toast: { template },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
