import { DateInput } from "@ui-sdk/solid/date-input"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal<string | null>("2026-11-02")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue(null)}>
          Clear
        </button>
      </div>
      <Field>
        <FieldLabel>Due date</FieldLabel>
        <DateInput
          value={value()}
          onValueChange={(next) => {
            setValue(next)
            log(`Due date ${next ?? "empty"}`)
          }}
        />
      </Field>
    </div>
  )
}

export { Example }
