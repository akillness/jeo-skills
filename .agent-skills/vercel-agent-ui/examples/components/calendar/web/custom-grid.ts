import { addMonths } from "@ui-sdk/core/date"
import "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

function isoWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4))
  const days = (day.getTime() - firstThursday.getTime()) / 86400000
  return 1 + Math.round((days - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-calendar default-value="2026-10-16" week-starts-on="1">
      <div data-slot="row">
        <ui-calendar-previous>
          <button data-variant="ghost">
            ${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-calendar-previous>
        <ui-calendar-heading></ui-calendar-heading>
        <ui-calendar-next>
          <button data-variant="ghost">
            ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-calendar-next>
      </div>
      <ui-calendar-grid>
        <ui-calendar-weekdays>
          <div>
            <span role="columnheader"><abbr title="Week">Wk</abbr></span>
            ${Array.from({ length: 7 }, (_, index) => `<ui-calendar-weekday index="${index}"></ui-calendar-weekday>`).join("")}
          </div>
        </ui-calendar-weekdays>
        <ui-calendar-weeks>
          <template><ui-calendar-day></ui-calendar-day></template>
        </ui-calendar-weeks>
      </ui-calendar-grid>
    </ui-calendar>
  `
  const calendar = root.querySelector("ui-calendar")!
  const previous = root.querySelector("ui-calendar-previous button")!
  const weeks = root.querySelector("ui-calendar-weeks")!
  const showPrevious = (month: string) => {
    previous.setAttribute(
      "title",
      `Show ${addMonths(`${month}-01`, -1).slice(0, 7)}`
    )
  }
  const numberWeeks = () => {
    for (const week of weeks.querySelectorAll("ui-calendar-week")) {
      const date = week
        .querySelector("ui-calendar-day[value]")
        ?.getAttribute("value")
      if (!date) {
        continue
      }
      let header = week.querySelector<HTMLElement>(
        ':scope > [role="rowheader"]'
      )
      if (!header) {
        header = document.createElement("span")
        header.setAttribute("role", "rowheader")
        header.dataset.slot = "hint"
      }
      if (week.firstElementChild !== header) {
        week.prepend(header)
      }
      const number = String(isoWeek(date))
      if (header.textContent !== number) {
        header.textContent = number
      }
    }
  }
  const observer = new MutationObserver(numberWeeks)
  observer.observe(weeks, { childList: true, subtree: true })
  numberWeeks()
  showPrevious(calendar.month)
  calendar.addEventListener("monthchange", (event) =>
    showPrevious(event.detail.value)
  )
  return () => observer.disconnect()
}

export { mount }
