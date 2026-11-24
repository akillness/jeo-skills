import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const regions = [
  {
    label: "Americas",
    items: [
      { value: "br", label: "Brazil" },
      { value: "ca", label: "Canada" },
      { value: "mx", label: "Mexico" },
    ],
  },
  {
    label: "Europe",
    items: [
      { value: "fr", label: "France" },
      { value: "de", label: "Germany" },
      { value: "es", label: "Spain" },
    ],
  },
  {
    label: "Asia Pacific",
    items: [
      { value: "au", label: "Australia" },
      { value: "jp", label: "Japan" },
      { value: "sg", label: "Singapore" },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Country</ui-field-label>
      <ui-select placeholder="Select a country">
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
          <ui-select-list>
            ${regions
              .map(
                (group) => `
                  <ui-select-group>
                    <ui-select-group-label>${group.label}</ui-select-group-label>
                    ${group.items
                      .map(
                        (item) => `
                          <ui-select-item value="${item.value}" label="${item.label}">
                            <ui-select-item-text>${item.label}</ui-select-item-text>
                            <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                          </ui-select-item>
                        `
                      )
                      .join("")}
                  </ui-select-group>
                `
              )
              .join("")}
          </ui-select-list>
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
}

export { mount }
