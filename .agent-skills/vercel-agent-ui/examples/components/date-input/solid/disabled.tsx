import { DateInput } from "@ui-sdk/solid/date-input"
import { Field, FieldLabel } from "@ui-sdk/solid/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Start date</FieldLabel>
      <DateInput defaultValue="2026-11-02" disabled />
    </Field>
  )
}

export { Example }
