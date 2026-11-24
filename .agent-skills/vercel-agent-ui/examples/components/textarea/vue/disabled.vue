<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Field disabled>
    <FieldLabel>Reply</FieldLabel>
    <Textarea default-value="Replies are closed for this thread." />
  </Field>
</template>
