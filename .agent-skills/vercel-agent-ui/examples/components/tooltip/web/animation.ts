import "@ui-sdk/web/tooltip"
import { Archive, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tooltip>
      <ui-tooltip-trigger>
        <button aria-label="Archive">${createElement(Archive, { "aria-hidden": "true" }).outerHTML}</button>
      </ui-tooltip-trigger>
      <ui-tooltip-content>Archive</ui-tooltip-content>
    </ui-tooltip>
  `
  const tooltip = root.querySelector("ui-tooltip")!
  tooltip.addEventListener("openchange", (event) =>
    log(root, event.detail.value ? "Opening" : "Closing")
  )
  tooltip.addEventListener("openchangecomplete", (event) =>
    log(root, event.detail.value ? "Open" : "Closed")
  )
}

export { mount }
