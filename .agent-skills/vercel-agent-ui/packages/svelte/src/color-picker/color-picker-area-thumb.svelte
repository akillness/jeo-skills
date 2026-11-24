<!--
@component
The area's thumb: a slider screen readers hear as both channels.
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
  import { useArea } from "./context"

  let {
    x,
    y,
    ...rest
  }: PartProps<"div", ColorPickerState> & ColorPickerAreaProps = $props()

  const area = useArea()
  const thumb = usePart(colorPicker, "area-thumb", () => ({
    x: x ?? area().x,
    y: y ?? area().y,
  }))
</script>

<Part tag="div" part={thumb} props={rest} />
