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
</script>

<template>
  <Field>
    <Slider
      :default-value="100"
      :min="25"
      :max="400"
      :large-step="25"
      :format="{ style: 'unit', unit: 'percent' }"
    >
      <div data-slot="row">
        <FieldLabel>Zoom</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb />
        </SliderTrack>
      </SliderControl>
    </Slider>
  </Field>
</template>
