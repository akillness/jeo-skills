import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"

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
