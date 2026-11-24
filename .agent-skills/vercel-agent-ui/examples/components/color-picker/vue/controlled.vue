<script setup lang="ts">
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  createColorPickerController,
} from "@ui-sdk/vue/color-picker"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const picker = createColorPickerController()
const value = ref("#0ea5e9")
</script>

<template>
  <div>
    <div data-slot="controls">
      <button type="button" @click="picker.setValue('#663399')">
        Use Purple
      </button>
    </div>
    <ColorPicker
      v-model:value="value"
      aria-label="Theme color"
      :controller="picker"
      @value-commit="
        (next, details) => log(`committed: ${next} (${details.reason})`)
      "
    >
      <ColorPickerArea>
        <ColorPickerAreaThumb />
      </ColorPickerArea>
      <ColorPickerSlider channel="hue">
        <ColorPickerSliderThumb />
      </ColorPickerSlider>
      <ColorPickerInput aria-label="Hex" />
    </ColorPicker>
  </div>
</template>
