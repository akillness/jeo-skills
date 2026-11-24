import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

const plans = [
  {
    value: "hobby",
    label: "Hobby",
    description: "Free for personal projects.",
  },
  {
    value: "pro",
    label: "Pro",
    description: "$20 per month for growing teams.",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "Custom pricing and support.",
  },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Plan</FieldLabel>
      <RadioGroup defaultValue="hobby">
        <For each={plans}>
          {(plan) => (
            <label data-slot="card">
              <span data-slot="stack">
                <span>{plan.label}</span>
                <span data-slot="hint">{plan.description}</span>
              </span>
              <Radio value={plan.value}>
                <RadioIndicator />
              </Radio>
            </label>
          )}
        </For>
      </RadioGroup>
    </Field>
  )
}

export { Example }
