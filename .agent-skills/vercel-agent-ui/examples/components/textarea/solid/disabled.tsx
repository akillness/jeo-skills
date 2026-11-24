import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Field disabled>
      <FieldLabel>Reply</FieldLabel>
      <Textarea defaultValue="Replies are closed for this thread." />
    </Field>
  )
}

export { Example }
