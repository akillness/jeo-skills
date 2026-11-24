import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

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
    </div>
  )
}

export { Example }
