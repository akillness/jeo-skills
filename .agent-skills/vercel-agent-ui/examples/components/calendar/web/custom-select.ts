import "@ui-sdk/web/calendar"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }))
const years = ["2024", "2025", "2026", "2027", "2028"].map((year) => ({
  value: year,
  label: year,
}))

const items = (options: { value: string; label: string }[]) =>
  options
    .map(
      (option) => `
        <ui-select-item value="${option.value}">
          ${option.label}
          <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
        </ui-select-item>
      `
    )
    .join("")

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-calendar default-month="2026-10" default-value="2026-10-16" min="2024-01-01" max="2028-12-31">
      <div data-slot="row">
        <ui-calendar-heading></ui-calendar-heading>
        <ui-select default-value="10">
          <ui-select-trigger>
            <button aria-label="Month">
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content hidden>${items(months)}</ui-select-content>
        </ui-select>
        <ui-select default-value="2026">
          <ui-select-trigger>
            <button aria-label="Year">
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content hidden>${items(years)}</ui-select-content>
        </ui-select>
      </div>
      <ui-calendar-grid>
        <ui-calendar-weekdays>
          <template><ui-calendar-weekday></ui-calendar-weekday></template>
        </ui-calendar-weekdays>
        <ui-calendar-weeks>
          <template><ui-calendar-day></ui-calendar-day></template>
        </ui-calendar-weeks>
      </ui-calendar-grid>
    </ui-calendar>
  `
  const calendar = root.querySelector("ui-calendar")!
  const [monthSelect, yearSelect] = root.querySelectorAll("ui-select")
  calendar.addEventListener("monthchange", (event) => {
    const [year, monthOfYear] = event.detail.value.split("-")
    yearSelect.value = year
    monthSelect.value = monthOfYear
  })
  monthSelect.addEventListener("valuechange", (event) => {
    if (event.detail.value) {
      calendar.month = `${calendar.month.split("-")[0]}-${event.detail.value}`
    }
  })
  yearSelect.addEventListener("valuechange", (event) => {
    if (event.detail.value) {
      calendar.month = `${event.detail.value}-${calendar.month.split("-")[1]}`
    }
  })
}

export { mount }
