import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Font size</ui-field-label>
      <ui-number-input default-value="16" min="8" max="72" wheel>
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
      <ui-field-description>Focus the input, then scroll over it.</ui-field-description>
    </ui-field>
  `
}

export { mount }
