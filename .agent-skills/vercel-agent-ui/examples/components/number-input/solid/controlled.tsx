import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/solid/number-input"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal<number | null>(4)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue(4)}>
          Reset to 4
        </button>
        <button type="button" onClick={() => setValue(null)}>
          Clear
        </button>
      </div>
      <Field>
        <FieldLabel>Servings</FieldLabel>
        <NumberInput
          value={value()}
          onValueChange={(next, details) => {
            setValue(next)
            log(`Value ${next ?? "empty"} (${details.reason})`)
          }}
          onValueCommit={(next, details) =>
            log(`Committed ${next ?? "empty"} (${details.reason})`)
          }
          min={1}
          max={12}
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
