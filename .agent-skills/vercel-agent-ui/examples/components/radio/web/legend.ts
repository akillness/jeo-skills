import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"

const periods = [
  { value: "monthly", label: "Monthly", price: "$12 per month" },
  { value: "yearly", label: "Yearly", price: "$120 per year" },
]

function mount(root: HTMLElement) {
  const id = crypto.randomUUID()
  root.innerHTML = `
    <ui-field-set>
      <fieldset>
        <legend id="${id}-legend">Billing period</legend>
        <ui-field-description id="${id}-description">Yearly billing gets you two months free.</ui-field-description>
        <ui-radio-group default-value="monthly" aria-labelledby="${id}-legend" aria-describedby="${id}-description">
          ${periods
            .map(
              (period) => `
                <label data-slot="label">
                  <ui-radio value="${period.value}">
                    <ui-radio-indicator></ui-radio-indicator>
                  </ui-radio>
                  ${period.label}
                  <span data-slot="hint">(${period.price})</span>
                </label>
              `
            )
            .join("")}
        </ui-radio-group>
      </fieldset>
    </ui-field-set>
  `
}

export { mount }
