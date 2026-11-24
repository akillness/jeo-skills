import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const users = [
  { id: 1, name: "Hollis Grant", username: "hollis", role: "Owner" },
  { id: 2, name: "Inès Moreau", username: "ines", role: "Admin" },
  { id: 3, name: "Kofi Mensah", username: "kofi", role: "Member" },
  { id: 4, name: "Wren Takahashi", username: "wren", role: "Member" },
  { id: 5, name: "Tomasz Wójcik", username: "tomasz", role: "Guest" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox>
      <div data-slot="stack">
        <ui-combobox-label>Owner</ui-combobox-label>
        <div data-slot="row">
          <ui-combobox-input>
            <input placeholder="Search people…" />
          </ui-combobox-input>
          <ui-combobox-trigger>
            <button aria-label="Show people">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No people found.</ui-combobox-empty>
        <ui-combobox-list>
          ${users
            .map(
              (user) => `
                <ui-combobox-item value="${user.username}" label="${user.name}" keywords="${user.username}">
                  <span data-slot="badge">${user.name.slice(0, 1)}</span>
                  <span data-slot="stack">
                    <span>${user.name}</span>
                    <span data-slot="hint">@${user.username}</span>
                  </span>
                  <span data-slot="hint">${user.role}</span>
                  <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                </ui-combobox-item>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>
  `
}

export { mount }
