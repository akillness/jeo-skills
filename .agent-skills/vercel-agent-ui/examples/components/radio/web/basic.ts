import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Shipping speed</ui-field-label>
      <ui-radio-group default-value="standard">
        ${speeds
          .map(
            (speed) => `
              <label data-slot="label">
                <ui-radio value="${speed.value}">
                  <ui-radio-indicator></ui-radio-indicator>
                </ui-radio>
                ${speed.label}
              </label>
            `
          )
          .join("")}
      </ui-radio-group>
    </ui-field>
  `
}

export { mount }
