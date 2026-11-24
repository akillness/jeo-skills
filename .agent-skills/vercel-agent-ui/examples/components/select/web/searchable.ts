import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const countries = [
  { value: "ar", label: "Argentina", code: "+54" },
  { value: "au", label: "Australia", code: "+61" },
  { value: "at", label: "Austria", code: "+43" },
  { value: "be", label: "Belgium", code: "+32" },
  { value: "br", label: "Brazil", code: "+55" },
  { value: "ca", label: "Canada", code: "+1" },
  { value: "cl", label: "Chile", code: "+56" },
  { value: "cn", label: "China", code: "+86" },
  { value: "dk", label: "Denmark", code: "+45" },
  { value: "fi", label: "Finland", code: "+358" },
  { value: "fr", label: "France", code: "+33" },
  { value: "de", label: "Germany", code: "+49" },
  { value: "gr", label: "Greece", code: "+30" },
  { value: "in", label: "India", code: "+91" },
  { value: "ie", label: "Ireland", code: "+353" },
  { value: "it", label: "Italy", code: "+39" },
  { value: "jp", label: "Japan", code: "+81" },
  { value: "mx", label: "Mexico", code: "+52" },
  { value: "nl", label: "Netherlands", code: "+31" },
  { value: "no", label: "Norway", code: "+47" },
  { value: "pt", label: "Portugal", code: "+351" },
  { value: "es", label: "Spain", code: "+34" },
  { value: "se", label: "Sweden", code: "+46" },
  { value: "ch", label: "Switzerland", code: "+41" },
]

const popularCountries = [
  {
    type: "group" as const,
    label: "Popular",
    items: [countries[5], countries[11], countries[16]],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Country</ui-field-label>
      <ui-select placeholder="Select a country" filter="contains">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          <ui-select-input>
            <input aria-label="Search countries" placeholder="Search countries…" />
          </ui-select-input>
          <ui-select-empty>No countries found.</ui-select-empty>
          <ui-select-list></ui-select-list>
        </ui-select-content>
        <template>
          <ui-select-group>
            <ui-select-group-label></ui-select-group-label>
          </ui-select-group>
          <ui-select-item>
            <ui-select-item-text></ui-select-item-text>
            <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
          </ui-select-item>
        </template>
      </ui-select>
    </ui-field>
  `
  const select = root.querySelector("ui-select")!
  select.emptyItems = popularCountries
  select.announcement = (change) =>
    change.type === "results"
      ? `${change.count} ${change.count === 1 ? "country" : "countries"} found`
      : null
  select.items = countries
}

export { mount }
