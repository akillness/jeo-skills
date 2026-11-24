<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const plans = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]
</script>

<template>
  <Field>
    <FieldLabel>Your plan</FieldLabel>
    <FieldDescription>Ask an admin to change plans.</FieldDescription>
    <RadioGroup default-value="pro" read-only>
      <label v-for="plan in plans" :key="plan.value" data-slot="label">
        <Radio :value="plan.value">
          <RadioIndicator />
        </Radio>
        {{ plan.label }}
      </label>
    </RadioGroup>
  </Field>
</template>
