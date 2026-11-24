import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"

function Example() {
  return (
    <Field name="message">
      <FieldLabel>Message</FieldLabel>
      <Textarea placeholder="Type your message here…" />
    </Field>
  )
}

export { Example }
