"use client"

import * as React from "react"
import { formatColor, parseColor, type ColorFormat } from "@ui-sdk/react/color"
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
} from "@ui-sdk/react/color-picker"
import { Pipette } from "lucide-react"

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

function Example() {
  const [format, setFormat] = React.useState<ColorFormat>("hex")
  const [value, setValue] = React.useState("#0ea5e9")

  function changeFormat(next: ColorFormat) {
    setFormat(next)
    setValue(formatColor(parseColor(value)!, next))
  }

  return (
    <ColorPicker
      aria-label="Brand color"
      format={format}
      value={value}
      onValueChange={setValue}
    >
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
          value={format}
          onChange={(event) => changeFormat(event.target.value as ColorFormat)}
        >
          {formats.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ColorPickerInput aria-label="Color" />
      </div>
      <ColorPickerSwatches aria-label="Presets">
        {presets.map((preset) => (
          <ColorPickerSwatchItem key={preset} value={preset} />
        ))}
      </ColorPickerSwatches>
    </ColorPicker>
  )
}

export { Example }
