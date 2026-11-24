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

const thumbs = ["Low", "Medium", "High"]
</script>

<template>
  <Field>
    <Slider
      :default-value="[10, 20, 70]"
      :step="10"
      :format="{ style: 'unit', unit: 'percent' }"
    >
      <div data-slot="row">
        <FieldLabel>Alert thresholds</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb
            v-for="(label, index) in thumbs"
            :key="label"
            :index="index"
            :aria-label="label"
          />
        </SliderTrack>
      </SliderControl>
    </Slider>
  </Field>
</template>
