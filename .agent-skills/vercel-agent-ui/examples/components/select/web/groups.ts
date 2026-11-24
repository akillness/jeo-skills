import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const fonts = [
  {
    label: "Sans serif",
    items: [
      { value: "inter", label: "Inter" },
      { value: "geist", label: "Geist" },
    ],
  },
  {
    label: "Serif",
    items: [
      { value: "source-serif", label: "Source Serif" },
      { value: "lora", label: "Lora" },
    ],
  },
  {
    label: "Monospace",
    items: [
      { value: "geist-mono", label: "Geist Mono" },
      { value: "jetbrains-mono", label: "JetBrains Mono" },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Font</ui-field-label>
      <ui-select placeholder="Select a font">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${fonts
            .map(
              (group, index) => `
                ${index > 0 ? "<ui-select-separator></ui-select-separator>" : ""}
                <ui-select-group>
                  <ui-select-group-label>${group.label}</ui-select-group-label>
                  ${group.items
                    .map(
                      (item) => `
                        <ui-select-item value="${item.value}">
                          ${item.label}
                          <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                        </ui-select-item>
                      `
                    )
                    .join("")}
                </ui-select-group>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
}

export { mount }
