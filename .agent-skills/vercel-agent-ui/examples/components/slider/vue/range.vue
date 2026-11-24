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
      :default-value="[25, 50]"
      :step="5"
      :format="{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }"
    >
      <div data-slot="row">
        <FieldLabel>Price</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb :index="0" aria-label="Minimum price" />
          <SliderThumb :index="1" aria-label="Maximum price" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  </Field>
</template>
