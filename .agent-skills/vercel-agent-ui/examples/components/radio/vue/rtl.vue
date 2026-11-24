<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const speeds = [
  { value: "standard", label: "عادي" },
  { value: "express", label: "سريع" },
  { value: "overnight", label: "خلال ليلة" },
]
</script>

<template>
  <div dir="rtl">
    <Field>
      <FieldLabel>سرعة الشحن</FieldLabel>
      <RadioGroup default-value="express">
        <label v-for="speed in speeds" :key="speed.value" data-slot="label">
          <Radio :value="speed.value">
            <RadioIndicator />
          </Radio>
          {{ speed.label }}
        </label>
      </RadioGroup>
    </Field>
  </div>
</template>
