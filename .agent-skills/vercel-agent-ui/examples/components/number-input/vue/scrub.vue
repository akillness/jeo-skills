<script setup lang="ts">
import { MoveHorizontalIcon } from "@lucide/vue"
import {
  NumberInput,
  NumberInputControl,
  NumberInputGroup,
  NumberInputScrubArea,
  NumberInputScrubAreaCursor,
} from "@ui-sdk/vue/number-input"
import { useId } from "vue"
import { useLog } from "../../../shared/vue/log"

const fields = [
  { label: "X position", handle: "X", defaultValue: 120 },
  { label: "Y position", handle: "Y", defaultValue: 48 },
  { label: "Width", handle: "W", defaultValue: 320, min: 0 },
  { label: "Height", handle: "H", defaultValue: 240, min: 0 },
]

const log = useLog()
const title = useId()
</script>

<template>
  <div data-slot="card" role="group" :aria-labelledby="title">
    <h3 :id="title">Frame</h3>
    <div data-slot="grid">
      <NumberInput
        v-for="field in fields"
        :key="field.label"
        :default-value="field.defaultValue"
        :min="field.min"
        @value-commit="(value) => log(`${field.label} ${value ?? 'empty'}`)"
      >
        <NumberInputGroup>
          <NumberInputScrubArea :pixels-per-step="1">
            <span aria-hidden="true">{{ field.handle }}</span>
            <NumberInputScrubAreaCursor>
              <MoveHorizontalIcon aria-hidden="true" />
            </NumberInputScrubAreaCursor>
          </NumberInputScrubArea>
          <NumberInputControl :aria-label="field.label" />
        </NumberInputGroup>
      </NumberInput>
    </div>
  </div>
</template>
