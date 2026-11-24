import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, MoveHorizontal, Plus } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-number-input default-value="1" min="1">
        <ui-number-input-scrub-area pixels-per-step="4">
          <ui-field-label>Quantity</ui-field-label>
          <ui-number-input-scrub-area-cursor>
            ${createElement(MoveHorizontal, { "aria-hidden": "true" }).outerHTML}
          </ui-number-input-scrub-area-cursor>
        </ui-number-input-scrub-area>
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
    </ui-field>
  `
  root
    .querySelector("ui-number-input")!
    .addEventListener("valuecommit", (event) => {
      log(root, `Quantity ${event.detail.value ?? "empty"}`)
    })
}

export { mount }
