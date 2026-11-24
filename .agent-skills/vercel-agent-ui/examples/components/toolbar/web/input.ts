import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/number-input"
import { createElement, Minus, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Text">
      <ui-number-input default-value="14" min="8" max="72">
        <ui-number-input-group>
          <ui-number-input-decrement>
            <button aria-label="Decrease font size">
              ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-number-input-decrement>
          <ui-toolbar-input>
            <ui-number-input-control>
              <input aria-label="Font size" />
            </ui-number-input-control>
          </ui-toolbar-input>
          <ui-number-input-increment>
            <button aria-label="Increase font size">
              ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-number-input-increment>
        </ui-number-input-group>
      </ui-number-input>
      <ui-toolbar-separator></ui-toolbar-separator>
      <ui-toolbar-input>
        <input aria-label="Find" placeholder="Find…" />
      </ui-toolbar-input>
    </ui-toolbar>
  `
}

export { mount }
