import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"

function Example() {
  return (
    <Field>
      <Checkbox name="two-factor" defaultChecked readOnly>
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
        <FieldLabel>Require two-factor authentication</FieldLabel>
        <FieldDescription>
          Your organization requires this setting.
        </FieldDescription>
      </div>
    </Field>
  )
}

export { Example }
