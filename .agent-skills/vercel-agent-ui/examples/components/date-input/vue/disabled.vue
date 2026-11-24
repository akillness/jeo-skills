<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <FieldLabel>Start date</FieldLabel>
    <DateInput default-value="2026-11-02" disabled />
  </Field>
</template>
