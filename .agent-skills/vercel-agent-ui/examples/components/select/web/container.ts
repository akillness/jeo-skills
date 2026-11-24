import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const fonts = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "source-serif", label: "Source Serif" },
  { value: "geist-mono", label: "Geist Mono" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Font</ui-field-label>
        <ui-select container="#select-container" default-value="inter">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${fonts
              .map(
                (font) => `
                  <ui-select-item value="${font.value}">
                    ${font.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
      <div id="select-container" data-slot="card"></div>
    </div>
  `
}

export { mount }
