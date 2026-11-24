<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

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
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Theme</FieldLabel>
    <FieldDescription>Set by your organization.</FieldDescription>
    <RadioGroup defaultValue="light" disabled>
      {#each themes as theme (theme.value)}
        <label data-slot="label">
          <Radio value={theme.value}>
            <RadioIndicator />
          </Radio>
          {theme.label}
        </label>
      {/each}
    </RadioGroup>
  </Field>
  <Field>
    <FieldLabel>Backups</FieldLabel>
    <FieldDescription>Hourly backups need the Pro plan.</FieldDescription>
    <RadioGroup defaultValue="daily">
      {#each backups as backup (backup.value)}
        <label data-slot="label">
          <Radio value={backup.value} disabled={backup.disabled}>
            <RadioIndicator />
          </Radio>
          {backup.label}
        </label>
      {/each}
    </RadioGroup>
  </Field>
</div>
