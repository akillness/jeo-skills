import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Toggle</button>
      </div>
      <label data-slot="label">
        <ui-checkbox>
          <ui-checkbox-indicator>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-checkbox-indicator>
        </ui-checkbox>
        Email me about product updates
      </label>
    </div>
  `
  const updates = root.querySelector("ui-checkbox")!
  root
    .querySelector("[data-slot=controls] button")!
    .addEventListener("click", () => updates.api.toggle())
  updates.addEventListener("checkedchange", (event) => {
    const { value, reason } = event.detail
    log(
      root,
      `${value === "indeterminate" ? "Mixed" : value ? "Checked" : "Unchecked"} (${reason})`
    )
  })
}

export { mount }
