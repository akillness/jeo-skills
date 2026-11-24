import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Field name="feedback">
      <FieldLabel>Feedback</FieldLabel>
      <Textarea placeholder="What could we do better?" />
      <FieldDescription>Only the product team can see this.</FieldDescription>
    </Field>
  )
}

export { Example }
