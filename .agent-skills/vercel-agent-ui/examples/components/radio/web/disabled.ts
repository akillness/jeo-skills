import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const backups = [
  { value: "hourly", label: "Hourly", disabled: true },
  { value: "daily", label: "Daily", disabled: false },
  { value: "weekly", label: "Weekly", disabled: false },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Theme</ui-field-label>
        <ui-field-description>Set by your organization.</ui-field-description>
        <ui-radio-group default-value="light" disabled>
          ${themes
            .map(
              (theme) => `
                <label data-slot="label">
                  <ui-radio value="${theme.value}">
                    <ui-radio-indicator></ui-radio-indicator>
                  </ui-radio>
                  ${theme.label}
                </label>
              `
            )
            .join("")}
        </ui-radio-group>
      </ui-field>
      <ui-field>
        <ui-field-label>Backups</ui-field-label>
        <ui-field-description>Hourly backups need the Pro plan.</ui-field-description>
        <ui-radio-group default-value="daily">
          ${backups
            .map(
              (backup) => `
                <label data-slot="label">
                  <ui-radio value="${backup.value}"${backup.disabled ? " disabled" : ""}>
                    <ui-radio-indicator></ui-radio-indicator>
                  </ui-radio>
                  ${backup.label}
                </label>
              `
            )
            .join("")}
        </ui-radio-group>
      </ui-field>
    </div>
  `
}

export { mount }
