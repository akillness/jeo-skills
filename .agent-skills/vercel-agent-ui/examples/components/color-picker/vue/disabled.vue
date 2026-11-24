<script setup lang="ts">
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
} from "@ui-sdk/vue/color-picker"
</script>

<template>
  <ColorPicker aria-label="Brand color" default-value="#0ea5e9" disabled>
    <ColorPickerArea>
      <ColorPickerAreaThumb />
    </ColorPickerArea>
    <ColorPickerSlider channel="hue">
      <ColorPickerSliderThumb />
    </ColorPickerSlider>
    <ColorPickerInput aria-label="Hex" />
  </ColorPicker>
</template>
