<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
</script>

<template>
  <div dir="rtl">
    <Field>
      <FieldLabel>الكمية</FieldLabel>
      <NumberInput :default-value="1" :min="0">
        <NumberInputGroup>
          <NumberInputDecrement aria-label="إنقاص">
            <MinusIcon aria-hidden="true" />
          </NumberInputDecrement>
          <NumberInputControl />
          <NumberInputIncrement aria-label="زيادة">
            <PlusIcon aria-hidden="true" />
          </NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
    </Field>
  </div>
</template>
