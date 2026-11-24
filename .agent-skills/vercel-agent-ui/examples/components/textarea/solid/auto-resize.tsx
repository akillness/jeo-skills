import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

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
