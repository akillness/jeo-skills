"use client"

import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldLabel } from "@ui-sdk/react/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Departure</FieldLabel>
      <DateInput granularity="minute" defaultValue="2026-11-02T14:30" />
    </Field>
  )
}

export { Example }
