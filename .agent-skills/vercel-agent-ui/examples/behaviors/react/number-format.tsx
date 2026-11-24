import * as React from "react"
import {
  formatNumber,
  formatNumberRange,
  formatNumberToParts,
} from "@ui-sdk/core/number"

const locales = ["en-US", "de-DE", "ja-JP", "zh-CN", "ar-EG", "hi-IN"]
const styles: Record<string, Intl.NumberFormatOptions> = {
  Currency: { style: "currency", currency: "EUR" },
  Percent: { style: "percent", maximumFractionDigits: 1 },
  Compact: { notation: "compact" },
  Unit: { style: "unit", unit: "kilometer-per-hour" },
}
const values: Record<string, [number, number]> = {
  Currency: [1234.5, 2500],
  Percent: [0.256, 0.5],
  Compact: [1234567, 9800000],
  Unit: [88, 120],
}

function Example() {
  const [locale, setLocale] = React.useState("en-US")
  const [style, setStyle] = React.useState("Currency")
  const [value, end] = values[style]
  const format = styles[style]
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <select
          aria-label="Locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          {locales.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select
          aria-label="Style"
          value={style}
          onChange={(event) => setStyle(event.target.value)}
        >
          {Object.keys(styles).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <div data-slot="number-format-result">
        <p data-formatted data-slot="number-format-value">
          {formatNumberToParts(value, locale, format).map((part, index) => (
            <span key={index} data-type={part.type}>
              {part.value}
            </span>
          ))}
        </p>
        <dl>
          <dt>Plain</dt>
          <dd data-plain>{formatNumber(value, locale, format)}</dd>
          <dt>Range</dt>
          <dd data-range>{formatNumberRange(value, end, locale, format)}</dd>
        </dl>
      </div>
    </div>
  )
}

export { Example }
