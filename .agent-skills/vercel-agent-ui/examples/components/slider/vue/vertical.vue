<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/vue/slider"

const channels = [
  { label: "Bass", value: 50 },
  { label: "Treble", value: 25 },
]
</script>

<template>
  <div data-slot="row">
    <Field v-for="channel in channels" :key="channel.label">
      <Slider orientation="vertical" :default-value="channel.value">
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
      <FieldLabel>{{ channel.label }}</FieldLabel>
    </Field>
  </div>
</template>
