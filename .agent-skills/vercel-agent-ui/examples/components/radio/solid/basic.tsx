import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Shipping speed</FieldLabel>
      <RadioGroup defaultValue="standard">
        <For each={speeds}>
          {(speed) => (
            <label data-slot="label">
              <Radio value={speed.value}>
                <RadioIndicator />
              </Radio>
              {speed.label}
            </label>
          )}
        </For>
      </RadioGroup>
    </Field>
  )
}

export { Example }
