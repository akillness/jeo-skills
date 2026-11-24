import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"

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
