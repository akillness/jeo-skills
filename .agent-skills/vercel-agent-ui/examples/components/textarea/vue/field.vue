<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Field name="feedback">
    <FieldLabel>Feedback</FieldLabel>
    <Textarea placeholder="What could we do better?" />
    <FieldDescription>Only the product team can see this.</FieldDescription>
  </Field>
</template>
