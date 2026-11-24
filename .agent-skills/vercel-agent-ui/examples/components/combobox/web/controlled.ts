import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"
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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="value">Choose Japan</button>
        <button type="button" data-action="open">Open</button>
      </div>
      <ui-combobox default-value="fr" debug>
        <div data-slot="stack">
          <ui-combobox-label>Country</ui-combobox-label>
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
    </div>
  `
  const combobox = root.querySelector("ui-combobox")!
  combobox.itemToLabel = (value) => countryLabel(value as string)
  combobox.addEventListener("valuechange", (event) =>
    log(root, `value: ${event.detail.value} (${event.detail.reason})`)
  )
  combobox.addEventListener("querychange", (event) =>
    log(root, `query: “${event.detail.value}” (${event.detail.reason})`)
  )
  combobox.addEventListener("openchange", (event) =>
    log(root, `open: ${event.detail.value} (${event.detail.reason})`)
  )
  root
    .querySelector("[data-action=value]")!
    .addEventListener("click", () => (combobox.value = "jp"))
  root
    .querySelector("[data-action=open]")!
    .addEventListener("click", () => (combobox.open = true))
}

export { mount }
