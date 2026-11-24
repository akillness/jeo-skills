import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import { Check, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-checkbox name="two-factor" default-checked read-only>
        <ui-checkbox-indicator>
          ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
        </ui-checkbox-indicator>
      </ui-checkbox>
      <div data-slot="stack">
        <ui-field-label>Require two-factor authentication</ui-field-label>
        <ui-field-description>
          Your organization requires this setting.
        </ui-field-description>
      </div>
    </ui-field>
  `
}

export { mount }
