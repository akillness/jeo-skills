import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

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
        {themes.map((theme) => (
          <label data-slot="label" key={theme.value}>
            <Radio value={theme.value}>
              <RadioIndicator keepMounted />
            </Radio>
            {theme.label}
          </label>
        ))}
      </RadioGroup>
    </Field>
  )
}

export { Example }
