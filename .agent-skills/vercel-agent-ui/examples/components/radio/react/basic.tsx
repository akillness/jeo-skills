import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

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
        {speeds.map((speed) => (
          <label data-slot="label" key={speed.value}>
            <Radio value={speed.value}>
              <RadioIndicator />
            </Radio>
            {speed.label}
          </label>
        ))}
      </RadioGroup>
    </Field>
  )
}

export { Example }
