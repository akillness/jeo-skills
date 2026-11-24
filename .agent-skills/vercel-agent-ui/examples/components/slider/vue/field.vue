<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
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
      :default-value="0.3"
      :format="{ style: 'percent' }"
      :min="0"
      :max="1"
      :step="0.01"
    >
      <div data-slot="row">
        <FieldLabel>Volume</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb />
        </SliderTrack>
      </SliderControl>
    </Slider>
    <FieldDescription>How loud notifications play.</FieldDescription>
  </Field>
</template>
