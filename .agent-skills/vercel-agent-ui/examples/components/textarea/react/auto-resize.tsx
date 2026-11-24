import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"

function Example() {
  return (
    <Field name="notes">
      <FieldLabel>Notes</FieldLabel>
      <Textarea autoResize placeholder="Add notes for the delivery driver…" />
      <FieldDescription>Your driver sees these notes.</FieldDescription>
    </Field>
  )
}

export { Example }
