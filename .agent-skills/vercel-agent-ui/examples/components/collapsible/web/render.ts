import "@ui-sdk/web/collapsible"
import { ChevronDown, createElement } from "lucide"

const updates = [
  { label: "Out for delivery", time: "07:40" },
  { label: "Arrived at the local depot", time: "05:12" },
  { label: "Left the sorting center", time: "Wed 21:03" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-collapsible data-variant="card">
      <h3>
        <ui-collapsible-trigger>
          <button type="button" aria-expanded="false">
            <span data-slot="stack">
              <span>Track parcel</span>
              <span data-slot="hint" data-show="open">3 updates</span>
              <span data-slot="hint" data-show="closed">Arrives Thursday</span>
            </span>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-collapsible-trigger>
      </h3>
      <ui-collapsible-panel as-child>
        <ol hidden>
          ${updates
            .map(
              (update) => `
                <li data-slot="row">
                  <span>${update.label}</span>
                  <span>${update.time}</span>
                </li>`
            )
            .join("")}
        </ol>
      </ui-collapsible-panel>
    </ui-collapsible>
  `
}

export { mount }
