import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { CheckIcon } from "lucide-react"

function Example() {
  return (
    <Field>
      <Checkbox>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      <div data-slot="stack">
        <FieldLabel>Accept terms and conditions</FieldLabel>
        <FieldDescription>
          By clicking this checkbox, you agree to the terms and conditions.
        </FieldDescription>
      </div>
    </Field>
  )
}

export { Example }
