<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <FieldLabel>Check-in</FieldLabel>
    <DateInput min="2026-01-01" max="2026-12-31" default-value="2026-06-15" />
    <FieldDescription>Any day in 2026.</FieldDescription>
    <FieldError />
  </Field>
</template>
