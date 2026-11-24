<script lang="ts">
  import { Pipette } from "@lucide/svelte"
  import {
    ColorPicker,
    ColorPickerChannelInput,
    ColorPickerEyeDropper,
    ColorPickerSwatches,
    ColorPickerSwatchItem,
  } from "@ui-sdk/svelte/color-picker"

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
</script>

<ColorPicker
  aria-label="Label color"
  space="srgb"
  format="hex"
  defaultValue="#0ea5e9"
>
  <ColorPickerSwatches aria-label="Presets">
    {#each presets as preset (preset)}
      <ColorPickerSwatchItem value={preset} />
    {/each}
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
