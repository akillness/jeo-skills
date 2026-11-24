<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

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

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Theme</FieldLabel>
      <FieldDescription>Set by your organization.</FieldDescription>
      <RadioGroup default-value="light" disabled>
        <label v-for="theme in themes" :key="theme.value" data-slot="label">
          <Radio :value="theme.value">
            <RadioIndicator />
          </Radio>
          {{ theme.label }}
        </label>
      </RadioGroup>
    </Field>
    <Field>
      <FieldLabel>Backups</FieldLabel>
      <FieldDescription>Hourly backups need the Pro plan.</FieldDescription>
      <RadioGroup default-value="daily">
        <label v-for="backup in backups" :key="backup.value" data-slot="label">
          <Radio :value="backup.value" :disabled="backup.disabled">
            <RadioIndicator />
          </Radio>
          {{ backup.label }}
        </label>
      </RadioGroup>
    </Field>
  </div>
</template>
