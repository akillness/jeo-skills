import "@ui-sdk/web/combobox"
import "@ui-sdk/web/field"
import { Check, ChevronDown, createElement, X } from "lucide"
import { log } from "../../../shared/web/log"

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

const interests = ["Design", "Engineering", "Marketing", "Research", "Sales"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field name="country">
        <ui-field-label>Country</ui-field-label>
        <ui-combobox required>
          <div data-slot="row">
            <ui-combobox-input>
              <input placeholder="Search countries…" />
            </ui-combobox-input>
            <ui-combobox-trigger>
              <button aria-label="Show countries">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
            </ui-combobox-trigger>
          </div>
          <ui-combobox-content hidden>
            <ui-combobox-empty>No countries found.</ui-combobox-empty>
            <ui-combobox-list>
              ${countries
                .map(
                  (country) => `
                    <ui-combobox-item value="${country.value}" label="${country.label}">
                      ${country.label}
                      <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                    </ui-combobox-item>
                  `
                )
                .join("")}
            </ui-combobox-list>
          </ui-combobox-content>
        </ui-combobox>
        <ui-field-description>Where we ship your order.</ui-field-description>
        <div>
          <ui-field-error match="valueMissing">Choose a country.</ui-field-error>
        </div>
      </ui-field>
      <ui-field name="interests">
        <ui-field-label>Interests</ui-field-label>
        <ui-combobox multiple default-value="Design">
          <ui-combobox-chips>
            <ui-combobox-input>
              <input placeholder="Add interests…" />
            </ui-combobox-input>
          </ui-combobox-chips>
          <ui-combobox-content hidden>
            <ui-combobox-list>
              ${interests
                .map(
                  (interest) => `
                    <ui-combobox-item value="${interest}">
                      ${interest}
                      <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                    </ui-combobox-item>
                  `
                )
                .join("")}
            </ui-combobox-list>
          </ui-combobox-content>
          <template>
            <ui-combobox-chip>
              <ui-combobox-chip-remove>
                <button type="button">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button>
              </ui-combobox-chip-remove>
            </ui-combobox-chip>
          </template>
        </ui-combobox>
      </ui-field>
      <div data-slot="row">
        <button type="submit">Submit</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  root.querySelector("ui-combobox")!.itemToLabel = (value) =>
    countryLabel(value as string)
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const entries = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Submitted ${entries.join("&")}`)
  })
}

export { mount }
