<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <FieldLabel>Departure</FieldLabel>
    <DateInput granularity="minute" default-value="2026-11-02T14:30" />
  </Field>
</template>
