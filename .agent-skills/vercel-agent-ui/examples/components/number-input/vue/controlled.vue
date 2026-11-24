<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import type { NumberInputValueChangeReason } from "@ui-sdk/core/number-input"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const value = ref<number | null>(4)

function onValueChange(
  next: number | null,
  details: { reason: NumberInputValueChangeReason }
) {
  log(`Value ${next ?? "empty"} (${details.reason})`)
}

function onValueCommit(
  next: number | null,
  details: { reason: NumberInputValueChangeReason }
) {
  log(`Committed ${next ?? "empty"} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="value = 4">Reset to 4</button>
      <button type="button" @click="value = null">Clear</button>
    </div>
    <Field>
      <FieldLabel>Servings</FieldLabel>
      <NumberInput
        v-model:value="value"
        :min="1"
        :max="12"
        @value-change="onValueChange"
        @value-commit="onValueCommit"
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
    </Field>
  </div>
</template>
