<script lang="ts">
  import {
    ColorPicker,
    ColorPickerArea,
    ColorPickerAreaThumb,
    ColorPickerInput,
    ColorPickerSlider,
    ColorPickerSliderThumb,
    ColorPickerSwatch,
  } from "@ui-sdk/svelte/color-picker"
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
</script>

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
