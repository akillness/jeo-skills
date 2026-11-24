<!--
@component
A track for one `channel`, drawn by `--color-slider-background`.
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
  import { provideSlider } from "./context"

  let {
    channel,
    orientation,
    ...rest
  }: PartProps<"div", ColorPickerSliderState> & ColorPickerSliderProps =
    $props()

  const id = $props.id()
  const channels = () => ({ id, channel, orientation })
  provideSlider(channels)
  const slider = usePart(colorPicker, "slider", channels)
</script>

<Part tag="div" part={slider} props={rest} />
