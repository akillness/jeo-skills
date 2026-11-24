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
  <Field>
    <FieldLabel>Temperature</FieldLabel>
    <NumberInput
      :default-value="-2"
      :min="-20"
      :max="40"
      :format="{ style: 'unit', unit: 'celsius' }"
    >
      <NumberInputGroup>
        <NumberInputDecrement aria-label="Colder">
          <template #render="{ props, state }">
            <button
              v-bind="props"
              :title="state.atBound ? 'As cold as it goes' : 'Colder'"
            >
              <MinusIcon aria-hidden="true" />
            </button>
          </template>
        </NumberInputDecrement>
        <NumberInputControl />
        <NumberInputIncrement v-slot="{ state }" aria-label="Warmer">
          <span v-if="state.atBound">Max</span>
          <PlusIcon v-else aria-hidden="true" />
        </NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
  </Field>
</template>
