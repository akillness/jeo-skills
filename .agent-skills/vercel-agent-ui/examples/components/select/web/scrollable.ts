import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const timezones = [
  {
    label: "North America",
    items: [
      { value: "est", label: "Eastern Standard Time" },
      { value: "cst", label: "Central Standard Time" },
      { value: "mst", label: "Mountain Standard Time" },
      { value: "pst", label: "Pacific Standard Time" },
      { value: "akst", label: "Alaska Standard Time" },
      { value: "hst", label: "Hawaii Standard Time" },
    ],
  },
  {
    label: "Europe & Africa",
    items: [
      { value: "gmt", label: "Greenwich Mean Time" },
      { value: "cet", label: "Central European Time" },
      { value: "eet", label: "Eastern European Time" },
      { value: "west", label: "Western European Summer Time" },
      { value: "cat", label: "Central Africa Time" },
      { value: "eat", label: "East Africa Time" },
    ],
  },
  {
    label: "Asia",
    items: [
      { value: "msk", label: "Moscow Time" },
      { value: "ist", label: "India Standard Time" },
      { value: "cst-china", label: "China Standard Time" },
      { value: "jst", label: "Japan Standard Time" },
      { value: "kst", label: "Korea Standard Time" },
      { value: "ist-indonesia", label: "Indonesia Central Standard Time" },
    ],
  },
  {
    label: "Australia & Pacific",
    items: [
      { value: "awst", label: "Australian Western Standard Time" },
      { value: "acst", label: "Australian Central Standard Time" },
      { value: "aest", label: "Australian Eastern Standard Time" },
      { value: "nzst", label: "New Zealand Standard Time" },
      { value: "fjt", label: "Fiji Time" },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Time zone</ui-field-label>
      <ui-select placeholder="Select a time zone">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${timezones
            .map(
              (group) => `
                <ui-select-group>
                  <ui-select-group-label>${group.label}</ui-select-group-label>
                  ${group.items
                    .map(
                      (item) => `
                        <ui-select-item value="${item.value}">
                          ${item.label}
                          <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                        </ui-select-item>
                      `
                    )
                    .join("")}
                </ui-select-group>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
}

export { mount }
