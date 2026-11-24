import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Theme</FieldLabel>
      <RadioGroup defaultValue="system">
        <For each={themes}>
          {(theme) => (
            <label data-slot="label">
              <Radio value={theme.value}>
                <RadioIndicator keepMounted />
              </Radio>
              {theme.label}
            </label>
          )}
        </For>
      </RadioGroup>
    </Field>
  )
}

export { Example }
