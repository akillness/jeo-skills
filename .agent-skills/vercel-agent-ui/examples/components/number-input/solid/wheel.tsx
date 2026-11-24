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
      <FieldLabel>Font size</FieldLabel>
      <NumberInput defaultValue={16} min={8} max={72} wheel>
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
      <FieldDescription>Focus the input, then scroll over it.</FieldDescription>
    </Field>
  )
}

export { Example }
