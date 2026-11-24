"use client"

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
} from "@ui-sdk/react/color-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@ui-sdk/react/popover"

function Example() {
  return (
    <ColorPicker aria-label="Background" defaultValue="#22c55e">
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
  )
}

export { Example }
