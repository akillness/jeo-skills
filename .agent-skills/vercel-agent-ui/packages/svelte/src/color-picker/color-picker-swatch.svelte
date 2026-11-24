<!--
@component
The color itself, as `--color-picker-color`, named for screen readers.
@experimental
-->
<script lang="ts">
  import { colorPicker, type ColorPickerState } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ColorPickerState> = $props()

  const part = usePart(colorPicker, "swatch")
</script>

<Part tag="div" {part} {props} />
