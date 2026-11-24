"use client"

import * as React from "react"
import { createCheckboxGroupController } from "@ui-sdk/core/checkbox"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

const days: { value: Day; label: string }[] = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
]

const weekdays: Day[] = ["mon", "tue", "wed", "thu", "fri"]

function Example() {
  const log = useLog()
  const [schedule] = React.useState(() => createCheckboxGroupController<Day>())
  const [value, setValue] = React.useState<Day[]>(["mon", "tue"])

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => schedule.setValue(weekdays)}>
          Select Weekdays
        </button>
        <button type="button" onClick={() => schedule.setValue([])}>
          Clear
        </button>
      </div>
      <h3 id="controlled-days">Working days</h3>
      <CheckboxGroup
        aria-labelledby="controlled-days"
        value={value}
        onValueChange={(next, details) => {
          setValue(next)
          const names = days
            .filter((day) => next.includes(day.value))
            .map((day) => day.label)
          log(`${names.join(", ") || "No days"} (${details.reason})`)
        }}
        controller={schedule}
      >
        {days.map((day) => (
          <label data-slot="label" key={day.value}>
            <Checkbox value={day.value}>
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            {day.label}
          </label>
        ))}
      </CheckboxGroup>
    </div>
  )
}

export { Example }
