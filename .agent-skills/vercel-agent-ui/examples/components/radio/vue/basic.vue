<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]
</script>

<template>
  <Field>
    <FieldLabel>Shipping speed</FieldLabel>
    <RadioGroup default-value="standard">
      <label v-for="speed in speeds" :key="speed.value" data-slot="label">
        <Radio :value="speed.value">
          <RadioIndicator />
        </Radio>
        {{ speed.label }}
      </label>
    </RadioGroup>
  </Field>
</template>
