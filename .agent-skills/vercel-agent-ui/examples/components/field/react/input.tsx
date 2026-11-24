import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"

function Example() {
  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Username</FieldLabel>
        <Input name="username" placeholder="hollis" autoComplete="username" />
        <FieldDescription>
          Choose a unique username for your account.
        </FieldDescription>
      </Field>
    </div>
  )
}

export { Example }
