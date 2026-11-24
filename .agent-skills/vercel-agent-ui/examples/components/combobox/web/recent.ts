import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const countries = [
  { value: "ar", label: "Argentina", keywords: ["república argentina"] },
  { value: "au", label: "Australia", keywords: ["oz"] },
  { value: "at", label: "Austria", keywords: ["österreich"] },
  { value: "be", label: "Belgium", keywords: ["belgië", "belgique"] },
  { value: "br", label: "Brazil", keywords: ["brasil"] },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark", keywords: ["danmark"] },
  { value: "fi", label: "Finland", keywords: ["suomi"] },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany", keywords: ["deutschland"] },
  { value: "gr", label: "Greece", keywords: ["hellas", "ελλάδα"] },
  { value: "jp", label: "Japan", keywords: ["nippon", "日本"] },
  { value: "nl", label: "Netherlands", keywords: ["holland", "nederland"] },
  { value: "es", label: "Spain", keywords: ["españa"] },
  { value: "se", label: "Sweden", keywords: ["sverige"] },
  {
    value: "ch",
    label: "Switzerland",
    keywords: ["schweiz", "suisse", "svizzera"],
  },
]

const recentCountries = [
  {
    type: "group" as const,
    label: "Recent",
    items: [countries[9], countries[12], countries[15]],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox>
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
        <ui-combobox-list></ui-combobox-list>
      </ui-combobox-content>
      <template>
        <ui-combobox-group>
          <ui-combobox-group-label></ui-combobox-group-label>
          <ui-combobox-item>
            <ui-combobox-item-text></ui-combobox-item-text>
            <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
          </ui-combobox-item>
        </ui-combobox-group>
      </template>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox")!
  combobox.emptyItems = recentCountries
  combobox.announcement = (change) =>
    change.type === "results" ? `${change.count} countries match` : null
  combobox.items = countries
}

export { mount }
