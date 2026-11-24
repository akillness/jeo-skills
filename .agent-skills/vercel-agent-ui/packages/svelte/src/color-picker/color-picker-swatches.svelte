<!--
@component
A list of preset colors. Arrow keys move between them.
@experimental
-->
<script lang="ts">
  import { colorPicker, type ColorPickerState } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ColorPickerState> = $props()

  const part = usePart(colorPicker, "swatches")
</script>

<Part tag="div" {part} {props} />
