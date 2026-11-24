<!--
@component
A preset color, as `--color-picker-color`. Pressing it sets the value.
@experimental
-->
<script lang="ts">
  import {
    colorPicker,
    type ColorPickerSwatchItemProps,
    type ColorPickerSwatchItemState,
  } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    value,
    ...rest
  }: PartProps<"button", ColorPickerSwatchItemState> &
    ColorPickerSwatchItemProps = $props()

  const item = usePart(colorPicker, "swatch-item", () => ({ value }))
</script>

<Part tag="button" part={item} props={rest} />
