import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"

function Example() {
  return (
    <Field>
      <div data-slot="stack">
        <FieldLabel>Encrypt backups</FieldLabel>
        <FieldDescription>
          Your organization manages this setting.
        </FieldDescription>
      </div>
      <Switch name="encrypt" defaultChecked readOnly>
        <SwitchThumb />
      </Switch>
    </Field>
  )
}

export { Example }
