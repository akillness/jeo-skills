import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { TimeInput } from "@ui-sdk/solid/time-input"

function Example() {
  return (
    <Field>
      <FieldLabel>Meeting time</FieldLabel>
      <TimeInput defaultValue="09:30" />
    </Field>
  )
}

export { Example }
