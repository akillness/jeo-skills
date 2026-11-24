import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/solid/number-input"

function Example() {
  return (
    <Field>
      <FieldLabel>Hours</FieldLabel>
      <NumberInput
        defaultValue={1.5}
        min={0}
        max={24}
        step={0.25}
        largeStep={1}
        smallStep={0.05}
      >
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Decrease">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </NumberInputDecrement>
          <NumberInputControl />
          <NumberInputIncrement aria-label="Increase">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
      <FieldDescription>Logged in quarter hours.</FieldDescription>
    </Field>
  )
}

export { Example }
