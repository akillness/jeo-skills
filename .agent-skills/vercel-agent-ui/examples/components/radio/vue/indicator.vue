<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]
</script>

<template>
  <Field>
    <FieldLabel>Theme</FieldLabel>
    <RadioGroup default-value="system">
      <label v-for="theme in themes" :key="theme.value" data-slot="label">
        <Radio :value="theme.value">
          <RadioIndicator keep-mounted />
        </Radio>
        {{ theme.label }}
      </label>
    </RadioGroup>
  </Field>
</template>
