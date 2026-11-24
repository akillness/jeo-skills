import "@ui-sdk/web/tooltip"
import { registerShortcut } from "@ui-sdk/web"
import { createElement, Save } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <ui-tooltip shortcut="mod+s">
        <ui-tooltip-trigger>
          <button aria-label="Save">${createElement(Save, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-tooltip-trigger>
        <ui-tooltip-content>
          Save
          <ui-tooltip-shortcut></ui-tooltip-shortcut>
        </ui-tooltip-content>
      </ui-tooltip>
      <ui-tooltip shortcut="mod+shift+e">
        <ui-tooltip-trigger><button>Share</button></ui-tooltip-trigger>
        <ui-tooltip-content>
          Share with your team
          <ui-tooltip-shortcut></ui-tooltip-shortcut>
        </ui-tooltip-content>
      </ui-tooltip>
    </div>
  `
  const save = () => log(root, "Saved")
  const share = () => log(root, "Shared")
  const [saveButton, shareButton] = root.querySelectorAll("button")
  saveButton.addEventListener("click", save)
  shareButton.addEventListener("click", share)
  const offSave = registerShortcut("mod+s", save)
  const offShare = registerShortcut("mod+shift+e", share)
  return () => {
    offSave()
    offShare()
  }
}

export { mount }
