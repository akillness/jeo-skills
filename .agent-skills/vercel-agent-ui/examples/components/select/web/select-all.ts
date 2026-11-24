import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement, Minus } from "lucide"

const regions = [
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "europe", label: "Europe" },
  { value: "asia-pacific", label: "Asia Pacific" },
  { value: "south-america", label: "South America" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Regions</ui-field-label>
      <ui-select multiple default-value="us-east, europe, asia-pacific" placeholder="Select regions">
        <ui-select-trigger>
          <button>
            <ui-select-value max-labels="2"></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          <ui-select-select-all>
            Select all
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
            ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
          </ui-select-select-all>
          <ui-select-separator></ui-select-separator>
          ${regions
            .map(
              (region) => `
                <ui-select-item value="${region.value}">
                  ${region.label}
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  root.querySelector("ui-select-value")!.getMoreLabel = (count) =>
    `${count} more`
}

export { mount }
