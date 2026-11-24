import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

const frequencies = [
  { value: "instant", label: "Instantly", description: "An email right away." },
  {
    value: "daily",
    label: "Daily digest",
    description: "One email each morning.",
  },
  {
    value: "weekly",
    label: "Weekly digest",
    description: "A summary every Monday.",
  },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Email notifications</FieldLabel>
      <RadioGroup defaultValue="daily">
        <For each={frequencies}>
          {(frequency) => (
            <Field>
              <Radio value={frequency.value}>
                <RadioIndicator />
              </Radio>
              <div data-slot="stack">
                <FieldLabel>{frequency.label}</FieldLabel>
                <FieldDescription>{frequency.description}</FieldDescription>
              </div>
            </Field>
          )}
        </For>
      </RadioGroup>
    </Field>
  )
}

export { Example }
