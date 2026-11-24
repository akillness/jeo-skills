<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
import { ref } from "vue"

const bio = ref(
  "Product designer in Lisbon. I write about type and interfaces."
)
</script>

<template>
  <Field name="bio">
    <FieldLabel>Bio</FieldLabel>
    <Textarea v-model:value="bio" :maxlength="160" />
    <FieldDescription>{{ bio.length }} / 160 characters</FieldDescription>
  </Field>
</template>
