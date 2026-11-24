<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
</script>

<template>
  <Field>
    <FieldLabel>Hours</FieldLabel>
    <NumberInput
      :default-value="1.5"
      :min="0"
      :max="24"
      :step="0.25"
      :large-step="1"
      :small-step="0.05"
    >
      <NumberInputGroup>
        <NumberInputDecrement aria-label="Decrease">
          <MinusIcon aria-hidden="true" />
        </NumberInputDecrement>
        <NumberInputControl />
        <NumberInputIncrement aria-label="Increase">
          <PlusIcon aria-hidden="true" />
        </NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
    <FieldDescription>Logged in quarter hours.</FieldDescription>
  </Field>
</template>
