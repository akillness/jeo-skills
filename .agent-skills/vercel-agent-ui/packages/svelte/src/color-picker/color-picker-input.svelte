<!--
@component
A text input that reads any CSS color on Enter or blur. Text that isn't one
goes back to the value. The core writes its text.
@experimental
-->
<script lang="ts">
  import { colorPicker, type ColorPickerState } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { TextPartProps } from "../text-control"

  let props: TextPartProps<"input", ColorPickerState> = $props()

  const input = usePart(colorPicker, "input")
</script>

<Part tag="input" part={input} {props} />
