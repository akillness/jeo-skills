import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

const speeds = [
  { value: "standard", label: "عادي" },
  { value: "express", label: "سريع" },
  { value: "overnight", label: "خلال ليلة" },
]

function Example() {
  return (
    <div dir="rtl">
      <Field>
        <FieldLabel>سرعة الشحن</FieldLabel>
        <RadioGroup defaultValue="express">
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
    </div>
  )
}

export { Example }
