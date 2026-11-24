import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const backups = [
  { value: "hourly", label: "Hourly", disabled: true },
  { value: "daily", label: "Daily", disabled: false },
  { value: "weekly", label: "Weekly", disabled: false },
]

function Example() {
  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Theme</FieldLabel>
        <FieldDescription>Set by your organization.</FieldDescription>
        <RadioGroup defaultValue="light" disabled>
          {themes.map((theme) => (
            <label data-slot="label" key={theme.value}>
              <Radio value={theme.value}>
                <RadioIndicator />
              </Radio>
              {theme.label}
            </label>
          ))}
        </RadioGroup>
      </Field>
      <Field>
        <FieldLabel>Backups</FieldLabel>
        <FieldDescription>Hourly backups need the Pro plan.</FieldDescription>
        <RadioGroup defaultValue="daily">
          {backups.map((backup) => (
            <label data-slot="label" key={backup.value}>
              <Radio value={backup.value} disabled={backup.disabled}>
                <RadioIndicator />
              </Radio>
              {backup.label}
            </label>
          ))}
        </RadioGroup>
      </Field>
    </div>
  )
}

export { Example }
