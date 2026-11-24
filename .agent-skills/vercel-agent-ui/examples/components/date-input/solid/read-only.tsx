import { DateInput } from "@ui-sdk/solid/date-input"
import { Field, FieldLabel } from "@ui-sdk/solid/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Signed on</FieldLabel>
      <DateInput defaultValue="2026-11-02" readOnly />
    </Field>
  )
}

export { Example }
