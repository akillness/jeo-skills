import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"
import { log } from "../../../shared/web/log"

const plans = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Choose Team</button>
      </div>
      <ui-field>
        <ui-field-label>Plan</ui-field-label>
        <ui-radio-group default-value="pro">
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
    </div>
  `
  const group = root.querySelector("ui-radio-group")!
  root
    .querySelector("[data-slot=controls] button")!
    .addEventListener("click", () => group.api.setValue("team"))
  group.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(
      root,
      `${plans.find((plan) => plan.value === value)?.label ?? "None"} (${reason})`
    )
  })
}

export { mount }
