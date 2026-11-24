import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"
import * as React from "react"

function Example() {
  const [bio, setBio] = React.useState(
    "Product designer in Lisbon. I write about type and interfaces."
  )
  return (
    <Field name="bio">
      <FieldLabel>Bio</FieldLabel>
      <Textarea value={bio} onValueChange={setBio} maxLength={160} />
      <FieldDescription>{bio.length} / 160 characters</FieldDescription>
    </Field>
  )
}

export { Example }
