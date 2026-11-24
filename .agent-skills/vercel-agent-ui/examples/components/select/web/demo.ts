import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Role</ui-field-label>
      <ui-select placeholder="Select a role">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${roles
            .map(
              (role) => `
                <ui-select-item value="${role.value}">
                  ${role.label}
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
}

export { mount }
