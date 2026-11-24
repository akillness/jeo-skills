<script setup lang="ts">
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
  <div dir="rtl" data-slot="stack">
    <Slider :default-value="[20, 60]" locale="ar-EG" aria-label="نطاق السعر">
      <div data-slot="row">
        <span data-slot="label">نطاق السعر</span>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb :index="0" aria-label="الحد الأدنى" />
          <SliderThumb :index="1" aria-label="الحد الأقصى" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  </div>
</template>
