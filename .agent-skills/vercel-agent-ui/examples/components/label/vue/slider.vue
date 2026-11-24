<script setup lang="ts">
import { Label } from "@ui-sdk/vue/label"
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
  <Slider id="volume" :default-value="75">
    <div data-slot="row">
      <Label for="volume">Volume</Label>
      <SliderValue />
    </div>
    <SliderControl>
      <SliderTrack>
        <SliderIndicator />
        <SliderThumb />
      </SliderTrack>
    </SliderControl>
  </Slider>
</template>
