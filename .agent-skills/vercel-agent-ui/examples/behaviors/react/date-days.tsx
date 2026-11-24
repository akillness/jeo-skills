import * as React from "react"
import {
  addDays,
  clampDate,
  daysBetween,
  formatDate,
  weekday,
} from "@ui-sdk/core/date"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"
import { useLog } from "../../shared/react/log"

const season = { min: "2026-11-01", max: "2027-01-31" }
const today = "2026-10-16"
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

function stay(picked: string, nights: number) {
  const checkIn = clampDate(picked || today, season.min, season.max)
  return { checkIn, checkOut: addDays(checkIn, nights) }
}

function Example() {
  const log = useLog()
  const [picked, setPicked] = React.useState("2026-12-24")
  const [nights, setNights] = React.useState(3)
  const { checkIn, checkOut } = stay(picked, nights)
  const change = (nextPicked: string, nextNights: number) => {
    setPicked(nextPicked)
    setNights(nextNights)
    const next = stay(nextPicked, nextNights)
    if (next.checkIn !== nextPicked) {
      log(`Moved into the season: ${next.checkIn}`)
    }
    log(
      `${days[weekday(next.checkIn)]} to ${days[weekday(next.checkOut)]}, ${daysBetween(today, next.checkIn)} days after ${formatDate(today, "en-US", { month: "short", day: "numeric" })}`
    )
  }
  return (
    <div data-slot="stack">
      <div data-slot="date-field-group">
        <Field>
          <FieldLabel>Check-in</FieldLabel>
          <FieldControl
            type="date"
            value={picked}
            onChange={(event) => change(event.target.value, nights)}
          />
        </Field>
        <Field>
          <FieldLabel>Nights</FieldLabel>
          <FieldControl
            type="number"
            min={1}
            max={14}
            value={nights}
            onChange={(event) =>
              change(picked, Number(event.target.value) || 1)
            }
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>Check-out</FieldLabel>
        <FieldControl type="date" readOnly value={checkOut} data-check-out />
        <FieldDescription data-check-in>
          Check-in {days[weekday(checkIn)]},{" "}
          {formatDate(checkIn, "en-US", { month: "long", day: "numeric" })}
        </FieldDescription>
      </Field>
    </div>
  )
}

export { Example }
