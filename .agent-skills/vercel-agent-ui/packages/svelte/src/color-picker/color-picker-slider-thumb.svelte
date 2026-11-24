<!--
@component
The slider's thumb, at `--color-slider-thumb-position`.
@experimental
-->
<script lang="ts">
  import {
    colorPicker,
    type ColorPickerSliderProps,
    type ColorPickerSliderState,
  } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { useSlider } from "./context"

  let {
    channel,
    orientation,
    ...rest
  }: PartProps<"div", ColorPickerSliderState> & ColorPickerSliderProps =
    $props()

  const slider = useSlider()
  const thumb = usePart(colorPicker, "slider-thumb", () => ({
    id: slider().id,
    channel: channel ?? slider().channel,
    orientation: orientation ?? slider().orientation,
  }))
</script>

<Part tag="div" part={thumb} props={rest} />
