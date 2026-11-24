<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { TimeInput } from "@ui-sdk/vue/time-input"
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>12-hour clock</FieldLabel>
      <TimeInput :hour-cycle="12" default-value="18:45" />
    </Field>
    <Field>
      <FieldLabel>24-hour clock</FieldLabel>
      <TimeInput :hour-cycle="24" default-value="18:45" />
    </Field>
    <Field>
      <FieldLabel>With seconds</FieldLabel>
      <TimeInput
        granularity="second"
        :hour-cycle="24"
        default-value="18:45:30"
      />
    </Field>
  </div>
</template>
