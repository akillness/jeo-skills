import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <label data-slot="label">
      <ui-checkbox>
        <ui-checkbox-indicator>
          ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
        </ui-checkbox-indicator>
      </ui-checkbox>
      Accept terms and conditions
    </label>
  `
}

export { mount }
