import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

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
        {plans.map((plan) => (
          <label data-slot="label" key={plan.value}>
            <Radio value={plan.value}>
              <RadioIndicator />
            </Radio>
            {plan.label}
          </label>
        ))}
      </RadioGroup>
    </Field>
  )
}

export { Example }
