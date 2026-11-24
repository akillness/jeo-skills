import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import { Check, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-checkbox>
        <ui-checkbox-indicator>
          ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
        </ui-checkbox-indicator>
      </ui-checkbox>
      <div data-slot="stack">
        <ui-field-label>Accept terms and conditions</ui-field-label>
        <ui-field-description>
          By clicking this checkbox, you agree to the terms and conditions.
        </ui-field-description>
      </div>
    </ui-field>
  `
}

export { mount }
