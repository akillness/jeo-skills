import { Field, FieldError, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Field invalid>
      <FieldLabel>Review</FieldLabel>
      <Textarea defaultValue="Great." />
      <FieldError match>Write at least 20 characters.</FieldError>
    </Field>
  )
}

export { Example }
