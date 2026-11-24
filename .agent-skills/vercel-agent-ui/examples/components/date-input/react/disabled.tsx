"use client"

import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldLabel } from "@ui-sdk/react/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Start date</FieldLabel>
      <DateInput defaultValue="2026-11-02" disabled />
    </Field>
  )
}

export { Example }
