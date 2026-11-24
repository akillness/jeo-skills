import { Field, FieldLabel } from "@ui-sdk/solid/field"
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
      <FieldLabel>Temperature</FieldLabel>
      <NumberInput
        defaultValue={-2}
        min={-20}
        max={40}
        format={{ style: "unit", unit: "celsius" }}
      >
        <NumberInputGroup>
          <NumberInputDecrement
            aria-label="Colder"
            render={(props, state) => (
              <button
                {...props}
                title={state.atBound ? "As cold as it goes" : "Colder"}
              />
            )}
          >
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
          <NumberInputIncrement aria-label="Warmer">
            {(state) =>
              state.atBound ? (
                <span>Max</span>
              ) : (
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
              )
            }
          </NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
    </Field>
  )
}

export { Example }
