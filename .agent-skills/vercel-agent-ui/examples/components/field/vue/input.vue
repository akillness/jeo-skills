<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Username</FieldLabel>
      <Input name="username" placeholder="hollis" autocomplete="username" />
      <FieldDescription
        >Choose a unique username for your account.</FieldDescription
      >
    </Field>
  </div>
</template>
