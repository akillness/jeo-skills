import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"

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
