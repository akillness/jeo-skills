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
      <FieldLabel>Delivery date</FieldLabel>
      <DateInput defaultValue="2026-11-02" unavailable={{ weekday: [0, 6] }} />
      <FieldDescription>We deliver Monday to Friday.</FieldDescription>
      <FieldError />
    </Field>
  )
}

export { Example }
