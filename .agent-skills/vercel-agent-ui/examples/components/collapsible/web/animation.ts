import "@ui-sdk/web/collapsible"
import { ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const notes = [
  "Search now matches file contents, not only names.",
  "Shared links remember the folder they were opened from.",
  "Uploads resume after the connection drops.",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-collapsible data-variant="card">
      <ui-collapsible-trigger>
        <button type="button" aria-expanded="false">
          <span data-slot="stack">
            <span>Release notes</span>
            <span data-slot="hint">Version 2.4, released October 28</span>
          </span>
          ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-collapsible-trigger>
      <ui-collapsible-panel hidden>
        <ul>
          ${notes.map((note) => `<li>${note}</li>`).join("")}
        </ul>
      </ui-collapsible-panel>
    </ui-collapsible>
  `
  root
    .querySelector("ui-collapsible")!
    .addEventListener("openchangecomplete", (event) => {
      log(root, event.detail.value ? "Finished opening" : "Finished closing")
    })
}

export { mount }
