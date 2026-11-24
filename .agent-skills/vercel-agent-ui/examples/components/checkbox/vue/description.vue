<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
</script>

<template>
  <Field>
    <Checkbox>
      <CheckboxIndicator>
        <CheckIcon aria-hidden="true" />
      </CheckboxIndicator>
    </Checkbox>
    <div data-slot="stack">
      <FieldLabel>Accept terms and conditions</FieldLabel>
      <FieldDescription
        >By clicking this checkbox, you agree to the terms and
        conditions.</FieldDescription
      >
    </div>
  </Field>
</template>
