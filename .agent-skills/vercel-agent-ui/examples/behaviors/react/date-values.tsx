import * as React from "react"
import { dateParts, isISODate, isoDate, toISODate } from "@ui-sdk/core/date"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"
import { useLog } from "../../shared/react/log"

const labels = { year: "Year", month: "Month", day: "Day" }

function Example() {
  const log = useLog()
  const [fields, setFields] = React.useState({
    year: "2026",
    month: "2",
    day: "30",
  })
  const [picked, setPicked] = React.useState("2026-10-16")
  const built = isoDate(
    Number(fields.year),
    Number(fields.month),
    Number(fields.day)
  )
  const change = (next: typeof fields) => {
    setFields(next)
    const date = isoDate(
      Number(next.year),
      Number(next.month),
      Number(next.day)
    )
    log(
      `isoDate(${next.year}, ${next.month}, ${next.day}): ${date ?? "no such day"}`
    )
  }
  const pick = (next: string) => {
    setPicked(next)
    const parts = isISODate(next) ? dateParts(next) : undefined
    log(
      parts
        ? `${next}: year ${parts.year}, month ${parts.month}, day ${parts.day}`
        : "Pick a date"
    )
  }
  return (
    <div data-slot="stack">
      <div data-slot="date-field-group">
        {(["year", "month", "day"] as const).map((field) => (
          <Field key={field} invalid={!built}>
            <FieldLabel>{labels[field]}</FieldLabel>
            <FieldControl
              inputMode="numeric"
              value={fields[field]}
              onChange={(event) =>
                change({ ...fields, [field]: event.target.value })
              }
            />
          </Field>
        ))}
      </div>
      <div data-slot="date-field-group">
        <Field>
          <FieldLabel>Picked date</FieldLabel>
          <FieldControl
            type="date"
            value={picked}
            onChange={(event) => pick(event.target.value)}
          />
        </Field>
        <button type="button" onClick={() => pick(toISODate(new Date())!)}>
          Today
        </button>
      </div>
    </div>
  )
}

export { Example }
