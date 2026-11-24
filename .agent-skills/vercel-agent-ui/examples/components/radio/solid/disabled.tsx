import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"

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
          <For each={themes}>
            {(theme) => (
              <label data-slot="label">
                <Radio value={theme.value}>
                  <RadioIndicator />
                </Radio>
                {theme.label}
              </label>
            )}
          </For>
        </RadioGroup>
      </Field>
      <Field>
        <FieldLabel>Backups</FieldLabel>
        <FieldDescription>Hourly backups need the Pro plan.</FieldDescription>
        <RadioGroup defaultValue="daily">
          <For each={backups}>
            {(backup) => (
              <label data-slot="label">
                <Radio value={backup.value} disabled={backup.disabled}>
                  <RadioIndicator />
                </Radio>
                {backup.label}
              </label>
            )}
          </For>
        </RadioGroup>
      </Field>
    </div>
  )
}

export { Example }
