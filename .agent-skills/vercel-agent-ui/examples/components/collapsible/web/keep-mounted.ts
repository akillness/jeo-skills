import "@ui-sdk/web/collapsible"
import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"
import { ChevronDown, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-collapsible data-variant="card">
      <ui-collapsible-trigger>
        <button type="button" aria-expanded="false">
          <span data-slot="stack">
            <span>Add a delivery note</span>
            <span data-slot="hint">Optional, for the courier</span>
          </span>
          ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-collapsible-trigger>
      <ui-collapsible-panel keep-mounted hidden>
        <ui-field>
          <ui-field-label>Delivery note</ui-field-label>
          <ui-textarea>
            <textarea placeholder="Leave it with the front desk…"></textarea>
          </ui-textarea>
        </ui-field>
      </ui-collapsible-panel>
    </ui-collapsible>
  `
}

export { mount }
