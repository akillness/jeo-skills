<!--
@component
A surface for two channels, `x` and `y`. Its background comes from
`--color-area-background` where gradients draw it, or a `ColorPickerAreaCanvas`.
@experimental
-->
<script lang="ts">
  import {
    colorPicker,
    type ColorPickerAreaProps,
    type ColorPickerState,
  } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { provideArea } from "./context"

  let {
    x,
    y,
    ...rest
  }: PartProps<"div", ColorPickerState> & ColorPickerAreaProps = $props()

  const channels = () => ({ x, y })
  provideArea(channels)
  const area = usePart(colorPicker, "area", channels)
</script>

<Part tag="div" part={area} props={rest} />
