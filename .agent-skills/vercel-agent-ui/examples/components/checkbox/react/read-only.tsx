import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { CheckIcon } from "lucide-react"

function Example() {
  return (
    <Field>
      <Checkbox name="two-factor" defaultChecked readOnly>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      <div data-slot="stack">
        <FieldLabel>Require two-factor authentication</FieldLabel>
        <FieldDescription>
          Your organization requires this setting.
        </FieldDescription>
      </div>
    </Field>
  )
}

export { Example }
