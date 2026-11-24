import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import type { ListData } from "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const plans = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

const sales = [
  { value: "enterprise", label: "Enterprise" },
  { value: "education", label: "Education", disabled: true },
]

const items: ListData = [
  ...plans,
  { type: "separator" },
  { type: "group", label: "Contact sales", items: sales },
]

const item = (plan: { value: string; label: string; disabled?: boolean }) => `
  <ui-select-item value="${plan.value}"${plan.disabled ? " disabled" : ""}>
    ${plan.label}
    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
  </ui-select-item>
`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Plan</ui-field-label>
      <ui-select default-value="pro">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${plans.map(item).join("")}
          <ui-select-separator></ui-select-separator>
          <ui-select-group>
            <ui-select-group-label>Contact sales</ui-select-group-label>
            ${sales.map(item).join("")}
          </ui-select-group>
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  root.querySelector("ui-select")!.items = items
}

export { mount }
