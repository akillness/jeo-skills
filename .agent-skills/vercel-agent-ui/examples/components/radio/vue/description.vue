<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const frequencies = [
  { value: "instant", label: "Instantly", description: "An email right away." },
  {
    value: "daily",
    label: "Daily digest",
    description: "One email each morning.",
  },
  {
    value: "weekly",
    label: "Weekly digest",
    description: "A summary every Monday.",
  },
]
</script>

<template>
  <Field>
    <FieldLabel>Email notifications</FieldLabel>
    <RadioGroup default-value="daily">
      <Field v-for="frequency in frequencies" :key="frequency.value">
        <Radio :value="frequency.value">
          <RadioIndicator />
        </Radio>
        <div data-slot="stack">
          <FieldLabel>{{ frequency.label }}</FieldLabel>
          <FieldDescription>{{ frequency.description }}</FieldDescription>
        </div>
      </Field>
    </RadioGroup>
  </Field>
</template>
