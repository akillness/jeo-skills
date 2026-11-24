<script setup lang="ts">
import { MinusIcon, MoveHorizontalIcon, PlusIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
} from "@ui-sdk/vue/number-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Field>
    <NumberInput
      :default-value="1"
      :min="1"
      @value-commit="(value) => log(`Quantity ${value ?? 'empty'}`)"
    >
      <NumberInputScrubArea :pixels-per-step="4">
        <FieldLabel>Quantity</FieldLabel>
        <NumberInputScrubAreaCursor>
          <MoveHorizontalIcon aria-hidden="true" />
        </NumberInputScrubAreaCursor>
      </NumberInputScrubArea>
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
  </Field>
</template>
