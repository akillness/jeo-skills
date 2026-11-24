<script lang="ts">
  import { Pipette } from "@lucide/svelte"
  import {
    formatColor,
    parseColor,
    type ColorFormat,
  } from "@ui-sdk/svelte/color"
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
  } from "@ui-sdk/svelte/color-picker"

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

  let format = $state<ColorFormat>("hex")
  let value = $state("#0ea5e9")

  function changeFormat(next: ColorFormat) {
    format = next
    value = formatColor(parseColor(value)!, next)
  }
</script>

<ColorPicker bind:value aria-label="Brand color" {format}>
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
      onchange={(event) =>
        changeFormat(event.currentTarget.value as ColorFormat)}
    >
      {#each formats as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <ColorPickerInput aria-label="Color" />
  </div>
  <ColorPickerSwatches aria-label="Presets">
    {#each presets as preset (preset)}
      <ColorPickerSwatchItem value={preset} />
    {/each}
  </ColorPickerSwatches>
</ColorPicker>
