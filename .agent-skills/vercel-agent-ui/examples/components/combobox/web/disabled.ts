import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const countries = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "jp", label: "Japan" },
  { value: "nl", label: "Netherlands" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value

const variants = [
  { label: "Billing country", attributes: 'default-value="fr" disabled' },
  { label: "Shipping from", attributes: 'default-value="fr" read-only' },
  { label: "Shipping to", attributes: "" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      ${variants
        .map(
          (variant) => `
            <ui-combobox ${variant.attributes}>
              <div data-slot="stack">
                <ui-combobox-label>${variant.label}</ui-combobox-label>
                <div data-slot="row">
                  <ui-combobox-input>
                    <input placeholder="Search countries…" />
                  </ui-combobox-input>
                  <ui-combobox-trigger>
                    <button aria-label="Show countries">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
                  </ui-combobox-trigger>
                </div>
              </div>
              <ui-combobox-content hidden>
                <ui-combobox-empty>No countries found.</ui-combobox-empty>
                <ui-combobox-list>
                  ${countries
                    .map(
                      (country) => `
                        <ui-combobox-item value="${country.value}" label="${country.label}" ${country.value === "dk" ? "disabled" : ""}>
                          ${country.label}
                          <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                        </ui-combobox-item>
                      `
                    )
                    .join("")}
                </ui-combobox-list>
              </ui-combobox-content>
            </ui-combobox>
          `
        )
        .join("")}
    </div>
  `
  for (const combobox of root.querySelectorAll<
    HTMLElement & { itemToLabel: (value: string) => string }
  >("ui-combobox")) {
    combobox.itemToLabel = countryLabel
  }
}

export { mount }
