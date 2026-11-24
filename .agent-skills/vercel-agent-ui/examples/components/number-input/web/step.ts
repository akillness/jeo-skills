import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Hours</ui-field-label>
      <ui-number-input default-value="1.5" min="0" max="24" step="0.25" large-step="1" small-step="0.05">
        <ui-number-input-group>
          <ui-number-input-decrement>
            <button aria-label="Decrease">
              ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-number-input-decrement>
          <ui-number-input-control>
            <input />
          </ui-number-input-control>
          <ui-number-input-increment>
            <button aria-label="Increase">
              ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-number-input-increment>
        </ui-number-input-group>
      </ui-number-input>
      <ui-field-description>Logged in quarter hours.</ui-field-description>
    </ui-field>
  `
}

export { mount }
