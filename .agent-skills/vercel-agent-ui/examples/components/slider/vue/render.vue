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
    <Slider :default-value="60">
      <div data-slot="row">
        <FieldLabel>Brightness</FieldLabel>
        <SliderValue v-slot="{ state }">{{ state.text }}%</SliderValue>
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb>
            <template #render="{ props, children }">
              <span v-bind="props"><component :is="children" /></span>
            </template>
            <template #default="{ state }">
              <span data-slot="output">{{ state.thumbValue }}</span>
            </template>
          </SliderThumb>
        </SliderTrack>
      </SliderControl>
    </Slider>
  </Field>
</template>
