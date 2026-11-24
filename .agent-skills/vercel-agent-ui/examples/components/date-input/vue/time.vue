<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { TimeInput } from "@ui-sdk/vue/time-input"
</script>

<template>
  <Field>
    <FieldLabel>Meeting time</FieldLabel>
    <TimeInput default-value="09:30" />
  </Field>
</template>
