<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <FieldLabel>Signed on</FieldLabel>
    <DateInput default-value="2026-11-02" read-only />
  </Field>
</template>
