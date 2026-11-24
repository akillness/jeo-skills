<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const plans = [
  {
    value: "hobby",
    label: "Hobby",
    description: "Free for personal projects.",
  },
  {
    value: "pro",
    label: "Pro",
    description: "$20 per month for growing teams.",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "Custom pricing and support.",
  },
]
</script>

<template>
  <Field>
    <FieldLabel>Plan</FieldLabel>
    <RadioGroup default-value="hobby">
      <label v-for="plan in plans" :key="plan.value" data-slot="card">
        <span data-slot="stack">
          <span>{{ plan.label }}</span>
          <span data-slot="hint">{{ plan.description }}</span>
        </span>
        <Radio :value="plan.value">
          <RadioIndicator />
        </Radio>
      </label>
    </RadioGroup>
  </Field>
</template>
