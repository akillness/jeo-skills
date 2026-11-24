<!--
@component
A button that picks a color from the screen, where the browser can.
Elsewhere it's disabled, with `data-unsupported`.
@experimental
-->
<script lang="ts">
  import { colorPicker, type ColorPickerState } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"button", ColorPickerState> = $props()

  const part = usePart(colorPicker, "eye-dropper")
</script>

<Part tag="button" {part} {props} />
