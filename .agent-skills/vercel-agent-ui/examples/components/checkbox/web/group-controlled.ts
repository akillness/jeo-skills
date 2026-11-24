import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const days = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
]

const weekdays = ["mon", "tue", "wed", "thu", "fri"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="weekdays">Select Weekdays</button>
        <button type="button" data-action="clear">Clear</button>
      </div>
      <h3 id="controlled-days">Working days</h3>
      <ui-checkbox-group aria-labelledby="controlled-days" default-value="mon,tue">
        ${days
          .map(
            (day) => `
              <label data-slot="label">
                <ui-checkbox value="${day.value}">
                  <ui-checkbox-indicator>
                    ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                  </ui-checkbox-indicator>
                </ui-checkbox>
                ${day.label}
              </label>
            `
          )
          .join("")}
      </ui-checkbox-group>
    </div>
  `
  const schedule = root.querySelector("ui-checkbox-group")!
  root
    .querySelector('[data-action="weekdays"]')!
    .addEventListener("click", () => schedule.api.setValue(weekdays))
  root
    .querySelector('[data-action="clear"]')!
    .addEventListener("click", () => schedule.api.setValue([]))
  schedule.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    const names = days
      .filter((day) => value.includes(day.value))
      .map((day) => day.label)
    log(root, `${names.join(", ") || "No days"} (${reason})`)
  })
}

export { mount }
