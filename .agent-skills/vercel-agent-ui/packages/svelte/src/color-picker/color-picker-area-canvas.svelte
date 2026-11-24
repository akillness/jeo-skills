<!--
@component
Paints the area pixel by pixel, for channels no gradient draws, like OKLCH's
chroma by lightness. Colors outside the gamut stay transparent.
@experimental
-->
<script lang="ts">
  import {
    colorPicker,
    type ColorPickerAreaProps,
  } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { useArea } from "./context"

  let { x, y, ...rest }: PartProps<"canvas", {}> & ColorPickerAreaProps =
    $props()

  const area = useArea()
  const canvas = usePart(colorPicker, "area-canvas", () => ({
    x: x ?? area().x,
    y: y ?? area().y,
  }))
</script>

<Part tag="canvas" part={canvas} props={rest} />
