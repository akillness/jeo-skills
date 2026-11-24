import * as React from "react"
import { formatNumber, isPartialNumber, parseNumber } from "@ui-sdk/core/number"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"
import { useLog } from "../../shared/react/log"

const locales = ["en-US", "de-DE", "fr-FR", "ar-EG"]

function Example() {
  const log = useLog()
  const [locale, setLocale] = React.useState("de-DE")
  const [text, setText] = React.useState("1.234,5")
  const value = parseNumber(text, locale)
  const typing = value === null && isPartialNumber(text, locale)
  const read = (next: string, nextLocale: string) => {
    const parsed = parseNumber(next, nextLocale)
    const verdict =
      parsed !== null
        ? String(parsed)
        : isPartialNumber(next, nextLocale)
          ? "keep typing"
          : "not a number"
    log(`“${next}” in ${nextLocale}: ${verdict}`)
  }
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <select
          aria-label="Locale"
          value={locale}
          onChange={(event) => {
            setLocale(event.target.value)
            read(text, event.target.value)
          }}
        >
          {locales.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <FieldControl
          inputMode="decimal"
          value={text}
          aria-invalid={value === null && !typing}
          onChange={(event) => {
            setText(event.target.value)
            read(event.target.value, locale)
          }}
        />
        <FieldDescription>Like {formatNumber(9876.5, locale)}</FieldDescription>
      </Field>
    </div>
  )
}

export { Example }
