import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
} from "@ui-sdk/solid/color-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@ui-sdk/solid/popover"

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
