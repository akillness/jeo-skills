<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Field name="notes">
    <FieldLabel>Notes</FieldLabel>
    <Textarea auto-resize placeholder="Add notes for the delivery driver…" />
    <FieldDescription>Your driver sees these notes.</FieldDescription>
  </Field>
</template>
