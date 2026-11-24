import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"

function Example() {
  return (
    <Field>
      <div data-slot="stack">
        <FieldLabel>Weekly digest</FieldLabel>
        <FieldDescription>
          A summary of your week, every Monday.
        </FieldDescription>
      </div>
      <Switch>
        <SwitchThumb />
      </Switch>
    </Field>
  )
}

export { Example }
