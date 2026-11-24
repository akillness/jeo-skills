<script setup lang="ts">
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
} from "@ui-sdk/vue/color-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@ui-sdk/vue/popover"
</script>

<template>
  <ColorPicker aria-label="Background" default-value="#22c55e">
    <Popover>
      <PopoverTrigger aria-label="Background">
        <ColorPickerSwatch />
      </PopoverTrigger>
      <PopoverContent>
        <ColorPickerArea>
          <ColorPickerAreaThumb />
        </ColorPickerArea>
        <ColorPickerSlider channel="hue">
          <ColorPickerSliderThumb />
        </ColorPickerSlider>
        <ColorPickerInput aria-label="Hex" />
      </PopoverContent>
    </Popover>
  </ColorPicker>
</template>
