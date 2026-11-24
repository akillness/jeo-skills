"use client"

import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [value, setValue] = React.useState<string | null>("2026-11-02")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue(null)}>
          Clear
        </button>
      </div>
      <Field>
        <FieldLabel>Due date</FieldLabel>
        <DateInput
          value={value}
          onValueChange={(next) => {
            setValue(next)
            log(`Due date ${next ?? "empty"}`)
          }}
        />
      </Field>
    </div>
  )
}

export { Example }
