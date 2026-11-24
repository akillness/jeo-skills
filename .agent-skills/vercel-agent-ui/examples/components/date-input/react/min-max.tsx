"use client"

import { DateInput } from "@ui-sdk/react/date-input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Check-in</FieldLabel>
      <DateInput min="2026-01-01" max="2026-12-31" defaultValue="2026-06-15" />
      <FieldDescription>Any day in 2026.</FieldDescription>
      <FieldError />
    </Field>
  )
}

export { Example }
