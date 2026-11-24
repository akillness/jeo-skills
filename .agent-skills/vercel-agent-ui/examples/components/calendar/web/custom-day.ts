import { weekday } from "@ui-sdk/core/date"
import "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

const priceOf = (date: string) => 80 + ((Number(date.slice(8)) * 7) % 5) * 10

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-calendar today="2026-10-16" default-value="2026-10-16">
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
          <template><ui-calendar-weekday></ui-calendar-weekday></template>
        </ui-calendar-weekdays>
        <ui-calendar-weeks>
          <template>
            <ui-calendar-day>
              <span data-slot="stack">
                <span data-label></span>
                <span data-slot="hint" data-price></span>
              </span>
            </ui-calendar-day>
          </template>
        </ui-calendar-weeks>
      </ui-calendar-grid>
    </ui-calendar>
  `
  const calendar = root.querySelector("ui-calendar")!
  const decorate = () => {
    for (const day of calendar.querySelectorAll("ui-calendar-day")) {
      const label = day.querySelector("[data-label]")!
      if (label.textContent) {
        continue
      }
      const date = day.getAttribute("value")!
      label.textContent = String(Number(date.slice(8)))
      day.querySelector("[data-price]")!.textContent = `$${priceOf(date)}`
    }
    const firstWeek = calendar.querySelector("ui-calendar-week")
    calendar
      .querySelectorAll("ui-calendar-weekday")
      .forEach((header, index) => {
        const name = header.getAttribute("aria-label")
        const date = firstWeek?.children[index]?.getAttribute("value")
        if (!name || !date || header.firstElementChild) {
          return
        }
        const abbr = document.createElement("abbr")
        abbr.title = name
        abbr.toggleAttribute(
          "data-weekend",
          weekday(date) === 0 || weekday(date) === 6
        )
        abbr.append(...header.childNodes)
        header.append(abbr)
      })
  }
  const observer = new MutationObserver(decorate)
  observer.observe(calendar, {
    childList: true,
    subtree: true,
    attributeFilter: ["aria-label"],
  })
  decorate()
  return () => observer.disconnect()
}

export { mount }
