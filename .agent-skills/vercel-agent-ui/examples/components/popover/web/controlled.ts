import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/popover"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-checkbox-indicator>
          </ui-checkbox>
          Open
        </label>
      </div>
      <ui-popover>
        <ui-popover-trigger>
          <button>Set Status</button>
        </ui-popover-trigger>
        <ui-popover-content>
          <ui-popover-title>Set a status</ui-popover-title>
          <ui-popover-description>Your team sees it next to your name.</ui-popover-description>
          <ui-field>
            <ui-field-label>Status</ui-field-label>
            <ui-input>
              <input value="In a meeting" />
            </ui-input>
          </ui-field>
          <div data-slot="row">
            <ui-popover-close>
              <button>Cancel</button>
            </ui-popover-close>
            <ui-popover-close>
              <button data-variant="solid">Save</button>
            </ui-popover-close>
          </div>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
  const controls = root.querySelector('[data-slot="controls"]')!
  const toggle = root.querySelector("ui-checkbox")!
  const popover = root.querySelector("ui-popover")!
  toggle.addEventListener("checkedchange", (event) => {
    popover.open = event.detail.value === true
  })
  popover.addEventListener("openchange", (event) => {
    const { value, reason, event: cause } = event.detail
    const inControls =
      cause?.target instanceof Node && controls.contains(cause.target)
    if (inControls && reason !== "escape-key") {
      return event.preventDefault()
    }
    toggle.checked = value
    log(root, `${value ? "Opened" : "Closed"} (${reason})`)
  })
}

export { mount }
