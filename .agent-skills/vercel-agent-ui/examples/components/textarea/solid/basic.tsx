import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Field name="message">
      <FieldLabel>Message</FieldLabel>
      <Textarea placeholder="Type your message here…" />
    </Field>
  )
}

export { Example }
