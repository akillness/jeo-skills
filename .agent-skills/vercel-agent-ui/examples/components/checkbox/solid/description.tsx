import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"

function Example() {
  return (
    <Field>
      <Checkbox>
        <CheckboxIndicator>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
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
