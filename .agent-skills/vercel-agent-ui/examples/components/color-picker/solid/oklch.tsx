import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaCanvas,
  ColorPickerAreaThumb,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
} from "@ui-sdk/solid/color-picker"

function Example() {
  return (
    <ColorPicker
      aria-label="Accent"
      space="oklch"
      defaultValue="oklch(0.62 0.19 259)"
    >
      <ColorPickerArea>
        <ColorPickerAreaCanvas />
        <ColorPickerAreaThumb />
      </ColorPickerArea>
      <ColorPickerSlider channel="hue">
        <ColorPickerSliderThumb />
      </ColorPickerSlider>
      <ColorPickerSlider channel="alpha">
        <ColorPickerSliderThumb />
      </ColorPickerSlider>
      <div data-slot="row">
        <ColorPickerSwatch />
        <ColorPickerInput aria-label="OKLCH" />
      </div>
    </ColorPicker>
  )
}

export { Example }
