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
    <FieldLabel>Delivery date</FieldLabel>
    <DateInput default-value="2026-11-02" :unavailable="{ weekday: [0, 6] }" />
    <FieldDescription>We deliver Monday to Friday.</FieldDescription>
    <FieldError />
  </Field>
</template>
