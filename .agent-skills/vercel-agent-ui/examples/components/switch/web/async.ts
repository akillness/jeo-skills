import "@ui-sdk/web/switch"
import { createElement, LoaderCircle } from "lucide"
import { log } from "../../../shared/web/log"

const save = (_checked: boolean) =>
  new Promise((resolve) => setTimeout(resolve, 800))

function mount(root: HTMLElement) {
  root.innerHTML = `
    <label data-slot="label">
      Automatic backups
      <ui-switch aria-busy="false">
        <ui-switch-thumb></ui-switch-thumb>
      </ui-switch>
    </label>
  `
  const backups = root.querySelector("ui-switch")!
  const thumb = root.querySelector("ui-switch-thumb")!
  let saving = false

  backups.addEventListener("checkedchange", (event) => {
    const { value, reason } = event.detail
    if (reason === "imperative") {
      return
    }
    event.preventDefault()
    if (saving) {
      return
    }
    saving = true
    backups.setAttribute("aria-busy", "true")
    thumb.replaceChildren(
      createElement(LoaderCircle, {
        "data-slot": "spinner",
        "aria-hidden": "true",
      })
    )
    log(root, "Saving…")
    save(value).then(() => {
      saving = false
      backups.api.setChecked(value, { reason: "imperative" })
      backups.setAttribute("aria-busy", "false")
      thumb.replaceChildren()
      log(root, `Saved: ${value ? "on" : "off"}`)
    })
  })
}

export { mount }
