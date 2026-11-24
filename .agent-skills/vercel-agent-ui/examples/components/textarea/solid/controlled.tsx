import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"
import { createSignal } from "solid-js"

function Example() {
  const [bio, setBio] = createSignal(
    "Product designer in Lisbon. I write about type and interfaces."
  )
  return (
    <Field name="bio">
      <FieldLabel>Bio</FieldLabel>
      <Textarea value={bio()} onValueChange={setBio} maxlength={160} />
      <FieldDescription>{bio().length} / 160 characters</FieldDescription>
    </Field>
  )
}

export { Example }
