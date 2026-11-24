import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"

function Example() {
  return (
    <Field disabled>
      <FieldLabel>Reply</FieldLabel>
      <Textarea defaultValue="Replies are closed for this thread." />
    </Field>
  )
}

export { Example }
