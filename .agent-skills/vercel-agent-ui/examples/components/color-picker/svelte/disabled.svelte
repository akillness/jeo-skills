<script lang="ts">
  import {
    ColorPicker,
    ColorPickerArea,
    ColorPickerAreaThumb,
    ColorPickerInput,
    ColorPickerSlider,
    ColorPickerSliderThumb,
  } from "@ui-sdk/svelte/color-picker"
</script>

<ColorPicker aria-label="Brand color" defaultValue="#0ea5e9" disabled>
  <ColorPickerArea>
    <ColorPickerAreaThumb />
  </ColorPickerArea>
  <ColorPickerSlider channel="hue">
    <ColorPickerSliderThumb />
  </ColorPickerSlider>
  <ColorPickerInput aria-label="Hex" />
</ColorPicker>
