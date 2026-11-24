<script setup lang="ts">
import { Field, FieldError, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Field invalid>
    <FieldLabel>Review</FieldLabel>
    <Textarea default-value="Great." />
    <FieldError match>Write at least 20 characters.</FieldError>
  </Field>
</template>
