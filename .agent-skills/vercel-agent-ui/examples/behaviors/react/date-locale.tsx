import * as React from "react"
import {
  dateFormatter,
  firstDayOfWeek,
  formatDate,
  formatDateRange,
  formatDateToParts,
  monthNames,
  weekdayNames,
} from "@ui-sdk/core/date"

const locales = [
  ["en-US", "English (US)"],
  ["en-US-u-fw-mon", "English (US), weeks from Monday"],
  ["de-DE", "Deutsch"],
  ["fr-FR", "Français"],
  ["ja-JP", "日本語"],
  ["fa-IR", "فارسی"],
]

const date = "2026-10-16"

function Example() {
  const [locale, setLocale] = React.useState("en-US")
  const first = firstDayOfWeek(locale)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <select
          aria-label="Locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          {locales.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      <p data-label data-slot="date-label">
        {formatDateToParts(date, locale, { month: "long", day: "numeric" }).map(
          (part, index) => (
            <span key={index} data-type={part.type}>
              {part.value}
            </span>
          )
        )}
      </p>
      <dl>
        <dt>Long</dt>
        <dd data-long>{formatDate(date, locale)}</dd>
        <dt>Range</dt>
        <dd data-range>{formatDateRange(date, "2026-10-20", locale)}</dd>
        <dt>Week</dt>
        <dd data-weekdays>{weekdayNames(locale, "short", first).join(" ")}</dd>
        <dt>Months</dt>
        <dd data-months>
          {monthNames(locale, "short").slice(0, 4).join(", ")}, …
        </dd>
        <dt>Calendar</dt>
        <dd data-calendar>
          {dateFormatter(locale, { month: "long" }).resolvedOptions().calendar}
        </dd>
      </dl>
    </div>
  )
}

export { Example }
