import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const plans = [
  {
    value: "hobby",
    label: "Hobby",
    description: "Free for personal projects.",
  },
  {
    value: "pro",
    label: "Pro",
    description: "$20 per month for growing teams.",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "Custom pricing and support.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Plan</ui-field-label>
      <ui-radio-group default-value="hobby">
        ${plans
          .map(
            (plan) => `
              <label data-slot="card">
                <span data-slot="stack">
                  <span>${plan.label}</span>
                  <span data-slot="hint">${plan.description}</span>
                </span>
                <ui-radio value="${plan.value}">
                  <ui-radio-indicator></ui-radio-indicator>
                </ui-radio>
              </label>
            `
          )
          .join("")}
      </ui-radio-group>
    </ui-field>
  `
}

export { mount }
