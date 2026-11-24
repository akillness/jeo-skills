import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-field>
        <ui-field-label>الكمية</ui-field-label>
        <ui-number-input default-value="1" min="0">
          <ui-number-input-group>
            <ui-number-input-decrement>
              <button aria-label="إنقاص">
                ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-number-input-decrement>
            <ui-number-input-control>
              <input />
            </ui-number-input-control>
            <ui-number-input-increment>
              <button aria-label="زيادة">
                ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-number-input-increment>
          </ui-number-input-group>
        </ui-number-input>
      </ui-field>
    </div>
  `
}

export { mount }
