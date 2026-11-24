import "@ui-sdk/web/tooltip"
import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
            </ui-checkbox-indicator>
          </ui-checkbox>
          Open
        </label>
      </div>
      <ui-tooltip>
        <ui-tooltip-trigger><button>Export</button></ui-tooltip-trigger>
        <ui-tooltip-content>Download as CSV</ui-tooltip-content>
      </ui-tooltip>
    </div>
  `
  const controls = root.querySelector('[data-slot="controls"]')!
  const checkbox = root.querySelector("ui-checkbox")!
  const tooltip = root.querySelector("ui-tooltip")!
  checkbox.addEventListener("checkedchange", (event) => {
    tooltip.open = event.detail.value === true
  })
  tooltip.addEventListener("openchange", (event) => {
    const { value, reason, event: cause } = event.detail
    const inControls =
      cause?.target instanceof Node && controls.contains(cause.target)
    if (inControls && reason !== "escape-key") {
      return event.preventDefault()
    }
    checkbox.checked = value
    log(root, `${value ? "Opened" : "Closed"} (${reason})`)
  })
}

export { mount }
