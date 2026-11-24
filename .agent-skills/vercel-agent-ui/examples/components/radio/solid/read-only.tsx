import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

const plans = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Your plan</FieldLabel>
      <FieldDescription>Ask an admin to change plans.</FieldDescription>
      <RadioGroup defaultValue="pro" readOnly>
        <For each={plans}>
          {(plan) => (
            <label data-slot="label">
              <Radio value={plan.value}>
                <RadioIndicator />
              </Radio>
              {plan.label}
            </label>
          )}
        </For>
      </RadioGroup>
    </Field>
  )
}

export { Example }
