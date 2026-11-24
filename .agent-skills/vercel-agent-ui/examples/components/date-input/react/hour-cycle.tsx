"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { TimeInput } from "@ui-sdk/react/time-input"

function Example() {
  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>12-hour clock</FieldLabel>
        <TimeInput hourCycle={12} defaultValue="18:45" />
      </Field>
      <Field>
        <FieldLabel>24-hour clock</FieldLabel>
        <TimeInput hourCycle={24} defaultValue="18:45" />
      </Field>
      <Field>
        <FieldLabel>With seconds</FieldLabel>
        <TimeInput
          granularity="second"
          hourCycle={24}
          defaultValue="18:45:30"
        />
      </Field>
    </div>
  )
}

export { Example }
