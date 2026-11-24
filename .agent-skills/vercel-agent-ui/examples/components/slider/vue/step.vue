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
  <div data-slot="stack">
    <Field>
      <Slider
        :default-value="2010"
        :min="1990"
        :max="2030"
        :step="5"
        :format="{ useGrouping: false }"
      >
        <div data-slot="row">
          <FieldLabel>Year</FieldLabel>
          <SliderValue />
        </div>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
        <div data-slot="ticks" aria-hidden="true">
          <span v-for="tick in 9" :key="tick" />
        </div>
      </Slider>
    </Field>
    <Field>
      <Slider :default-value="0.5" :min="0" :max="1" :step="0.05">
        <div data-slot="row">
          <FieldLabel>Opacity</FieldLabel>
          <SliderValue />
        </div>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
        <div data-slot="ticks" aria-hidden="true">
          <span v-for="tick in 21" :key="tick" />
        </div>
      </Slider>
    </Field>
  </div>
</template>
