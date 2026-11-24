import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const timezones = [
  {
    label: "Americas",
    items: [
      { value: "America/New_York", label: "New York" },
      { value: "America/Chicago", label: "Chicago" },
      { value: "America/Denver", label: "Denver" },
      { value: "America/Los_Angeles", label: "Los Angeles" },
      { value: "America/Sao_Paulo", label: "São Paulo" },
    ],
  },
  {
    label: "Europe",
    items: [
      { value: "Europe/London", label: "London" },
      { value: "Europe/Paris", label: "Paris" },
      { value: "Europe/Berlin", label: "Berlin" },
      { value: "Europe/Madrid", label: "Madrid" },
    ],
  },
  {
    label: "Asia & Pacific",
    items: [
      { value: "Asia/Tokyo", label: "Tokyo" },
      { value: "Asia/Singapore", label: "Singapore" },
      { value: "Asia/Kolkata", label: "Kolkata" },
      { value: "Australia/Sydney", label: "Sydney" },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox>
      <div data-slot="stack">
        <ui-combobox-label>Timezone</ui-combobox-label>
        <div data-slot="row">
          <ui-combobox-input>
            <input placeholder="Search cities…" />
          </ui-combobox-input>
          <ui-combobox-trigger>
            <button aria-label="Show timezones">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No cities found.</ui-combobox-empty>
        <ui-combobox-list>
          ${timezones
            .map(
              (group, index) => `
                ${index > 0 ? `<ui-combobox-separator></ui-combobox-separator>` : ""}
                <ui-combobox-group>
                  <ui-combobox-group-label>${group.label}</ui-combobox-group-label>
                  ${group.items
                    .map(
                      (item) => `
                        <ui-combobox-item value="${item.value}" label="${item.label}">
                          ${item.label}
                          <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                        </ui-combobox-item>
                      `
                    )
                    .join("")}
                </ui-combobox-group>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>
  `
}

export { mount }
