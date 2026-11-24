import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  createNumberInputController,
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/solid/number-input"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const zoom = createNumberInputController()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => zoom.decrement({ large: true })}>
          Zoom Out
        </button>
        <button type="button" onClick={() => zoom.increment({ large: true })}>
          Zoom In
        </button>
        <button type="button" onClick={() => zoom.setValue(100)}>
          Actual Size
        </button>
        <button
          type="button"
          onClick={() => log(`Zoom is ${zoom.getValue()}%`)}
        >
          Read
        </button>
        <button type="button" onClick={() => zoom.focus()}>
          Focus
        </button>
      </div>
      <Field>
        <FieldLabel>Zoom</FieldLabel>
        <NumberInput
          defaultValue={100}
          min={10}
          max={400}
          step={10}
          format={{ style: "unit", unit: "percent" }}
          controller={zoom}
          onValueChange={(value, details) =>
            log(`Zoom ${value ?? "empty"}% (${details.reason})`)
          }
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
      </Field>
    </div>
  )
}

export { Example }
