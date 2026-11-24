import "@ui-sdk/web/combobox"
import { Check, createElement, Minus } from "lucide"

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
    <ui-combobox multiple default-value="Europe/Paris">
      <div data-slot="stack">
        <ui-combobox-label>Timezones</ui-combobox-label>
        <ui-combobox-chips>
          <ui-combobox-input>
            <input placeholder="Add timezones…" />
          </ui-combobox-input>
        </ui-combobox-chips>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No timezones found.</ui-combobox-empty>
        <ui-combobox-list>
          <ui-combobox-select-all>
            <span>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
              ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
            </span>
            Select all
          </ui-combobox-select-all>
          ${timezones
            .map(
              (group) => `
                <ui-combobox-group>
                  <ui-combobox-group-label>${group.label}</ui-combobox-group-label>
                  <ui-combobox-select-all>
                    <span data-hide="checked">Select all in ${group.label}</span>
                    <span data-show="checked">Clear ${group.label}</span>
                  </ui-combobox-select-all>
                  ${group.items
                    .map(
                      (zone) => `
                        <ui-combobox-item value="${zone.value}" label="${zone.label}">
                          <span>
                            <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                          </span>
                          ${zone.label}
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
      <template>
        <ui-combobox-chip>
          <ui-combobox-chip-remove><button type="button">×</button></ui-combobox-chip-remove>
        </ui-combobox-chip>
      </template>
    </ui-combobox>
  `
}

export { mount }
