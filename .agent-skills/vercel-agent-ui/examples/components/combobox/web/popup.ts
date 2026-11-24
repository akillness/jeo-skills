import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement, Search } from "lucide"

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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox default-value="jp">
      <ui-combobox-trigger>
        <button id="combobox-popup-button" aria-label="Country">
          <span>Japan</span>
          ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-combobox-trigger>
      <ui-combobox-content hidden anchor="#combobox-popup-button">
        <div data-slot="row">
          ${createElement(Search, { "aria-hidden": "true" }).outerHTML}
          <ui-combobox-input>
            <input autofocus aria-label="Search countries" placeholder="Search…" />
          </ui-combobox-input>
        </div>
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
  `
  const combobox = root.querySelector("ui-combobox") as HTMLElement & {
    query: string
    itemToLabel: (value: string) => string
  }
  const button = root.querySelector<HTMLButtonElement>(
    "#combobox-popup-button"
  )!
  combobox.itemToLabel = countryLabel
  combobox.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string | null }>).detail
    button.querySelector("span")!.textContent = value
      ? countryLabel(value)
      : "Select a country"
  })
  combobox.addEventListener("openchange", (event) => {
    if ((event as CustomEvent<{ value: boolean }>).detail.value) {
      combobox.query = ""
    }
  })
  combobox.addEventListener("openchangecomplete", (event) => {
    if (!(event as CustomEvent<{ value: boolean }>).detail.value) {
      button.focus()
    }
  })
}

export { mount }
