import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"

function Example() {
  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Username</FieldLabel>
        <Input name="username" placeholder="hollis" autocomplete="username" />
        <FieldDescription>
          Choose a unique username for your account.
        </FieldDescription>
      </Field>
    </div>
  )
}

export { Example }
