import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const countries = [
  { value: "ca", label: "Canada" },
  { value: "dk", label: "Denmark" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
]

const fields = [
  { label: "Billing country", disabled: true },
  { label: "Shipping from", readOnly: true },
  { label: "Shipping to" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      ${fields
        .map(
          (field) => `
            <ui-field>
              <ui-field-label>${field.label}</ui-field-label>
              <ui-select
                ${field.disabled || field.readOnly ? 'default-value="fr"' : ""}
                placeholder="Select a country"
                ${field.disabled ? "disabled" : ""}
                ${field.readOnly ? "read-only" : ""}
              >
                <ui-select-trigger>
                  <button>
                    <ui-select-value></ui-select-value>
                    ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                  </button>
                </ui-select-trigger>
                <ui-select-content>
                  ${countries
                    .map(
                      (country) => `
                        <ui-select-item value="${country.value}"${country.value === "dk" ? " disabled" : ""}>
                          ${country.label}
                          <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                        </ui-select-item>
                      `
                    )
                    .join("")}
                </ui-select-content>
              </ui-select>
            </ui-field>
          `
        )
        .join("")}
    </div>
  `
}

export { mount }
