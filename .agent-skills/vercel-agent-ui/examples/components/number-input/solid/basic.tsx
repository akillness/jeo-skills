import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
} from "@ui-sdk/solid/number-input"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <Field>
      <NumberInput
        defaultValue={1}
        min={1}
        onValueCommit={(value) => log(`Quantity ${value ?? "empty"}`)}
      >
        <NumberInputScrubArea pixelsPerStep={4}>
          <FieldLabel>Quantity</FieldLabel>
          <NumberInputScrubAreaCursor>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m18 8 4 4-4 4" />
              <path d="M2 12h20" />
              <path d="m6 8-4 4 4 4" />
            </svg>
          </NumberInputScrubAreaCursor>
        </NumberInputScrubArea>
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
    </Field>
  )
}

export { Example }
