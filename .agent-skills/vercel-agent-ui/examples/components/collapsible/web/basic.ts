import "@ui-sdk/web/collapsible"
import { ChevronDown, createElement } from "lucide"

const items = [
  { name: "Linen shirt", price: "$48.00" },
  { name: "Canvas tote", price: "$18.00" },
  { name: "Wool socks", price: "$18.00" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-collapsible data-variant="card">
      <ui-collapsible-trigger>
        <button type="button" aria-expanded="false">
          <span data-slot="stack">
            <span>Order #4189</span>
            <span data-slot="hint">3 items, $84.00</span>
          </span>
          ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-collapsible-trigger>
      <ui-collapsible-panel hidden>
        ${items
          .map(
            (item) => `
              <div data-slot="row">
                <span>${item.name}</span>
                <span>${item.price}</span>
              </div>`
          )
          .join("")}
      </ui-collapsible-panel>
    </ui-collapsible>
  `
}

export { mount }
