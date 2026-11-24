import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Theme</ui-field-label>
      <ui-radio-group default-value="system">
        ${themes
          .map(
            (theme) => `
              <label data-slot="label">
                <ui-radio value="${theme.value}">
                  <ui-radio-indicator keep-mounted></ui-radio-indicator>
                </ui-radio>
                ${theme.label}
              </label>
            `
          )
          .join("")}
      </ui-radio-group>
    </ui-field>
  `
}

export { mount }
