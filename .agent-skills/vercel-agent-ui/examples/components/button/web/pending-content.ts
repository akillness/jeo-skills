import "@ui-sdk/web/button"
import { ArrowDownToLine, createElement, LoaderCircle } from "lucide"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-button pending-announcement="Saving">
      <button>
        ${createElement(ArrowDownToLine, { "data-show": "idle", "aria-hidden": "true" }).outerHTML}
        ${createElement(LoaderCircle, { "data-show": "pending", "data-slot": "spinner", "aria-hidden": "true" }).outerHTML}
        Save
      </button>
    </ui-button>
  `
  root
    .querySelector("ui-button")!
    .addEventListener("action", (event) => event.detail.waitUntil(wait(1500)))
}

export { mount }
