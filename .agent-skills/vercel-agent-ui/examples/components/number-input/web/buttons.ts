import "@ui-sdk/web/number-input"
import { createElement, Minus, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-number-input default-value="1" min="0">
      <ui-number-input-group>
        <ui-number-input-decrement>
          <button aria-label="Decrease">
            ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-number-input-decrement>
        <ui-number-input-control>
          <input aria-label="Quantity" />
        </ui-number-input-control>
        <ui-number-input-increment>
          <button aria-label="Increase">
            ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-number-input-increment>
      </ui-number-input-group>
    </ui-number-input>
  `
}

export { mount }
