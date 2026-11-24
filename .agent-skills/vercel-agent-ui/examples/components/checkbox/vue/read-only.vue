<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <Checkbox name="two-factor" default-checked read-only>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    <div data-slot="stack">
      <FieldLabel>Require two-factor authentication</FieldLabel>
      <FieldDescription
        >Your organization requires this setting.</FieldDescription
      >
    </div>
  </Field>
</template>
