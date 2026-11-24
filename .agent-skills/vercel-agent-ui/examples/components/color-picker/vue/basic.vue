<script setup lang="ts">
import { Pipette } from "@lucide/vue"
import { formatColor, parseColor, type ColorFormat } from "@ui-sdk/vue/color"
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
} from "@ui-sdk/vue/color-picker"
import { ref } from "vue"

const formats: { label: string; value: ColorFormat }[] = [
  { label: "Hex", value: "hex" },
  { label: "RGB", value: "srgb" },
  { label: "HSL", value: "hsl" },
  { label: "OKLCH", value: "oklch" },
]

const presets = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
]

const format = ref<ColorFormat>("hex")
const value = ref("#0ea5e9")

function changeFormat(next: ColorFormat) {
  format.value = next
  value.value = formatColor(parseColor(value.value)!, next)
}
</script>

<template>
  <ColorPicker v-model:value="value" aria-label="Brand color" :format="format">
    <ColorPickerArea>
      <ColorPickerAreaThumb />
    </ColorPickerArea>
    <div data-slot="row">
      <ColorPickerEyeDropper aria-label="Pick from screen">
        <Pipette aria-hidden="true" />
      </ColorPickerEyeDropper>
      <div data-slot="color-picker-sliders">
        <ColorPickerSlider channel="hue">
          <ColorPickerSliderThumb />
        </ColorPickerSlider>
        <ColorPickerSlider channel="alpha">
          <ColorPickerSliderThumb />
        </ColorPickerSlider>
      </div>
      <ColorPickerSwatch />
    </div>
    <div data-slot="row">
      <select
        aria-label="Format"
        :value="format"
        @change="
          changeFormat(
            ($event.target as HTMLSelectElement).value as ColorFormat
          )
        "
      >
        <option
          v-for="option in formats"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <ColorPickerInput aria-label="Color" />
    </div>
    <ColorPickerSwatches aria-label="Presets">
      <ColorPickerSwatchItem
        v-for="preset in presets"
        :key="preset"
        :value="preset"
      />
    </ColorPickerSwatches>
  </ColorPicker>
</template>
