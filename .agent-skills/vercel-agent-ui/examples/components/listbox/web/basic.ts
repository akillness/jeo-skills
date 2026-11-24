import "@ui-sdk/web/field"
import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"

const topics = [
  { value: "comments", label: "Comments" },
  { value: "mentions", label: "Mentions" },
  { value: "reactions", label: "Reactions" },
  { value: "sign-ins", label: "New sign-ins" },
  { value: "billing", label: "Billing" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Email me about</ui-field-label>
      <ui-listbox multiple activation="automatic" default-value="mentions">
        ${topics
          .map(
            (topic) => `
              <ui-listbox-item value="${topic.value}">
                ${topic.label}
                <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
              </ui-listbox-item>`
          )
          .join("")}
      </ui-listbox>
      <ui-field-description>Hold Shift to select a range, or Ctrl or ⌘ to add one.</ui-field-description>
    </ui-field>
  `
}

export { mount }
