import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const frequencies = [
  { value: "instant", label: "Instantly", description: "An email right away." },
  {
    value: "daily",
    label: "Daily digest",
    description: "One email each morning.",
  },
  {
    value: "weekly",
    label: "Weekly digest",
    description: "A summary every Monday.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Email notifications</ui-field-label>
      <ui-radio-group default-value="daily">
        ${frequencies
          .map(
            (frequency) => `
              <ui-field>
                <ui-radio value="${frequency.value}">
                  <ui-radio-indicator></ui-radio-indicator>
                </ui-radio>
                <div data-slot="stack">
                  <ui-field-label>${frequency.label}</ui-field-label>
                  <ui-field-description>${frequency.description}</ui-field-description>
                </div>
              </ui-field>
            `
          )
          .join("")}
      </ui-radio-group>
    </ui-field>
  `
}

export { mount }
