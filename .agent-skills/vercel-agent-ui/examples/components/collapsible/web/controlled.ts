import "@ui-sdk/web/collapsible"
import { ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const recoveryCodes = ["7KQ2-M9XD", "P4TR-8HZC", "W3NB-6JUE", "C5YF-2LSA"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Toggle</button>
      </div>
      <ui-collapsible data-variant="card">
        <ui-collapsible-trigger>
          <button type="button" aria-expanded="false">
            <span data-slot="stack">
              <span>Recovery codes</span>
              <span data-slot="hint">Each code signs you in once</span>
            </span>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-collapsible-trigger>
        <ui-collapsible-panel hidden>
          <div data-slot="stack">
            <ul>${recoveryCodes.map((code) => `<li>${code}</li>`).join("")}</ul>
            <button type="button">Done</button>
          </div>
        </ui-collapsible-panel>
      </ui-collapsible>
    </div>
  `
  const collapsible = root.querySelector("ui-collapsible")!
  root
    .querySelector("[data-slot=controls] button")!
    .addEventListener("click", () => collapsible.api.toggle())
  root
    .querySelector("ui-collapsible-panel button")!
    .addEventListener("click", () => collapsible.api.close())
  collapsible.addEventListener("openchange", (event) => {
    const { value, reason } = event.detail
    log(root, `${value ? "Opened" : "Closed"} (${reason})`)
  })
}

export { mount }
