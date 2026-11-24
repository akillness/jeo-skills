import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/label"
import { Check, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-label>
      <ui-checkbox>
        <ui-checkbox-indicator>
          ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
        </ui-checkbox-indicator>
      </ui-checkbox>
      Accept terms and conditions
    </ui-label>
  `
}

export { mount }
