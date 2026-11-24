<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Field name="message">
    <FieldLabel>Message</FieldLabel>
    <Textarea placeholder="Type your message here…" />
  </Field>
</template>
