import "@ui-sdk/web/collapsible"
import { ChevronDown, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-collapsible data-variant="card">
      <ui-collapsible-trigger>
        <button type="button" aria-expanded="false">
          <span data-slot="stack">
            <span>Ingredients</span>
            <span data-slot="hint">Morning buns, makes 12</span>
          </span>
          ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-collapsible-trigger>
      <ui-collapsible-panel hidden-until-found hidden="until-found">
        <p>Flour, butter, brown sugar, eggs, a pinch of cardamom and sea salt.</p>
      </ui-collapsible-panel>
    </ui-collapsible>
  `
}

export { mount }
