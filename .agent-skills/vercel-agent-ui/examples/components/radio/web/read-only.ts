import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const plans = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Your plan</ui-field-label>
      <ui-field-description>Ask an admin to change plans.</ui-field-description>
      <ui-radio-group default-value="pro" read-only>
        ${plans
          .map(
            (plan) => `
              <label data-slot="label">
                <ui-radio value="${plan.value}">
                  <ui-radio-indicator></ui-radio-indicator>
                </ui-radio>
                ${plan.label}
              </label>
            `
          )
          .join("")}
      </ui-radio-group>
    </ui-field>
  `
}

export { mount }
