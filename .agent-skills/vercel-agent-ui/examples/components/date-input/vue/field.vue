<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <FieldLabel>Birthday</FieldLabel>
    <DateInput name="birthday" />
    <FieldDescription>We send a card on the day.</FieldDescription>
  </Field>
</template>
