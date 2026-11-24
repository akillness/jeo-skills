"use client"

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
} from "@ui-sdk/react/color-picker"

function Example() {
  return (
    <ColorPicker aria-label="Brand color" defaultValue="#0ea5e9" disabled>
      <ColorPickerArea>
        <ColorPickerAreaThumb />
      </ColorPickerArea>
      <ColorPickerSlider channel="hue">
        <ColorPickerSliderThumb />
      </ColorPickerSlider>
      <ColorPickerInput aria-label="Hex" />
    </ColorPicker>
  )
}

export { Example }
