import "@ui-sdk/web/combobox"
import { Check, createElement } from "lucide"

const labels = [
  "Bug",
  "Feature",
  "Documentation",
  "Design",
  "Performance",
  "Security",
  "Testing",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox multiple max-selected="3" default-value="Bug, Design">
      <div data-slot="stack">
        <ui-combobox-label>Labels (up to 3)</ui-combobox-label>
        <ui-combobox-chips>
          <ui-combobox-input>
            <input placeholder="Add labels…" />
          </ui-combobox-input>
        </ui-combobox-chips>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-list>
          ${labels
            .map(
              (label) => `
                <ui-combobox-item value="${label}" label="${label}">
                  ${label}
                  <span data-slot="hint" data-show="disabled">Limit reached</span>
                  <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                </ui-combobox-item>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
      <template>
        <ui-combobox-chip>
          <ui-combobox-chip-remove><button type="button">×</button></ui-combobox-chip-remove>
        </ui-combobox-chip>
      </template>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox")
}

export { mount }
