import { DateInput } from "@ui-sdk/solid/date-input"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"

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
