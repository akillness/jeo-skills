<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/vue/slider"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const value = ref([0.3, 0.7])
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="value = [0.3, 0.7]">Reset</button>
    </div>
    <Field>
      <Slider
        v-model:value="value"
        @value-change="
          (next, details) => log(`${next.join(' – ')} (${details.reason})`)
        "
        :min="0"
        :max="1"
        :step="0.1"
      >
        <div data-slot="row">
          <FieldLabel>Temperature</FieldLabel>
          <SliderValue />
        </div>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb :index="0" aria-label="Minimum temperature" />
            <SliderThumb :index="1" aria-label="Maximum temperature" />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </Field>
  </div>
</template>
