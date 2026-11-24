<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
</script>

<template>
  <NumberInput :default-value="1" :min="0">
    <NumberInputGroup>
      <NumberInputDecrement aria-label="Decrease">
        <MinusIcon aria-hidden="true" />
      </NumberInputDecrement>
      <NumberInputControl aria-label="Quantity" />
      <NumberInputIncrement aria-label="Increase">
        <PlusIcon aria-hidden="true" />
      </NumberInputIncrement>
    </NumberInputGroup>
  </NumberInput>
</template>
