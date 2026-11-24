import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"

const fields = [
  {
    label: "Preis",
    locale: "de-DE",
    defaultValue: 1234.5,
    step: 0.01,
    format: { style: "currency", currency: "EUR" },
  },
  {
    label: "Budget",
    locale: "en-IN",
    defaultValue: 1234567,
    step: 1000,
    format: { style: "currency", currency: "INR", maximumFractionDigits: 0 },
  },
] satisfies {
  label: string
  locale: string
  defaultValue: number
  step: number
  format: Intl.NumberFormatOptions
}[]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      ${fields
        .map(
          (field) => `
            <ui-field>
              <ui-field-label>${field.label}</ui-field-label>
              <ui-number-input default-value="${field.defaultValue}" step="${field.step}" locale="${field.locale}" min="0">
                <ui-number-input-group>
                  <ui-number-input-decrement>
                    <button aria-label="Decrease">
                      ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-number-input-decrement>
                  <ui-number-input-control>
                    <input />
                  </ui-number-input-control>
                  <ui-number-input-increment>
                    <button aria-label="Increase">
                      ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-number-input-increment>
                </ui-number-input-group>
              </ui-number-input>
              <ui-field-description>Formatted for ${field.locale}.</ui-field-description>
            </ui-field>`
        )
        .join("")}
    </div>
  `
  root
    .querySelectorAll<HTMLElement & { format: Intl.NumberFormatOptions }>(
      "ui-number-input"
    )
    .forEach((el, index) => {
      el.format = fields[index].format
    })
}

export { mount }
