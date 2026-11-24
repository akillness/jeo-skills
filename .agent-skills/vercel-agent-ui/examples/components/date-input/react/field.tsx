"use client"

import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Birthday</FieldLabel>
      <DateInput name="birthday" />
      <FieldDescription>We send a card on the day.</FieldDescription>
    </Field>
  )
}

export { Example }
