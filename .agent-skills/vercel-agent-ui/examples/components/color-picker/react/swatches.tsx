"use client"

import {
  ColorPicker,
  ColorPickerChannelInput,
  ColorPickerEyeDropper,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
} from "@ui-sdk/react/color-picker"
import { Pipette } from "lucide-react"

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

function Example() {
  return (
    <ColorPicker
      aria-label="Label color"
      space="srgb"
      format="hex"
      defaultValue="#0ea5e9"
    >
      <ColorPickerSwatches aria-label="Presets">
        {presets.map((preset) => (
          <ColorPickerSwatchItem key={preset} value={preset} />
        ))}
      </ColorPickerSwatches>
      <div data-slot="row">
        <ColorPickerChannelInput channel="red" />
        <ColorPickerChannelInput channel="green" />
        <ColorPickerChannelInput channel="blue" />
        <ColorPickerEyeDropper aria-label="Pick from screen">
          <Pipette aria-hidden="true" />
        </ColorPickerEyeDropper>
      </div>
    </ColorPicker>
  )
}

export { Example }
