import * as React from "react"
import { datePattern, formatDate, parseDate } from "@ui-sdk/core/date"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"
import { useLog } from "../../shared/react/log"

const locales = [
  ["en-US", "English (US)"],
  ["de-DE", "Deutsch"],
  ["fr-FR", "Français"],
  ["ar-EG", "العربية"],
]

function Example() {
  const log = useLog()
  const [locale, setLocale] = React.useState("en-US")
  const [text, setText] = React.useState("10/16/26")
  const [reference, setReference] = React.useState("2026-10-16")
  const pattern = datePattern(locale)
  const read = (next: {
    locale?: string
    text?: string
    reference?: string
  }) => {
    const options = { locale, text, reference, ...next }
    const date = parseDate(options.text, options.locale, {
      referenceDate: options.reference,
    })
    log(
      `“${options.text}”: ${date ? `${date}, ${formatDate(date, options.locale)}` : "not a date"}`
    )
  }
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <select
          aria-label="Locale"
          value={locale}
          onChange={(event) => {
            setLocale(event.target.value)
            read({ locale: event.target.value })
          }}
        >
          {locales.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Reference date"
          value={reference}
          onChange={(event) => {
            const next = event.target.value || "2026-10-16"
            setReference(next)
            read({ reference: next })
          }}
        />
      </div>
      <Field>
        <FieldLabel>Date</FieldLabel>
        <FieldControl
          placeholder={pattern.placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            read({ text: event.target.value })
          }}
        />
        <FieldDescription data-pattern>
          {pattern.fields.join(` ${pattern.separator} `)}
        </FieldDescription>
      </Field>
    </div>
  )
}

export { Example }
