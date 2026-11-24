<script setup lang="ts">
import { MinusIcon, PlusIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  createNumberInputController,
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/vue/number-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const zoom = createNumberInputController()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="zoom.decrement({ large: true })">
        Zoom Out
      </button>
      <button type="button" @click="zoom.increment({ large: true })">
        Zoom In
      </button>
      <button type="button" @click="zoom.setValue(100)">Actual Size</button>
      <button type="button" @click="log(`Zoom is ${zoom.getValue()}%`)">
        Read
      </button>
      <button type="button" @click="zoom.focus()">Focus</button>
    </div>
    <Field>
      <FieldLabel>Zoom</FieldLabel>
      <NumberInput
        :default-value="100"
        :min="10"
        :max="400"
        :step="10"
        :format="{ style: 'unit', unit: 'percent' }"
        :controller="zoom"
        @value-change="
          (value, details) =>
            log(`Zoom ${value ?? 'empty'}% (${details.reason})`)
        "
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
