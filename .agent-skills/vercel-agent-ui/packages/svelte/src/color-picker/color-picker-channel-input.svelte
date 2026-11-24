<!--
@component
A number input for one `channel`, in the units people read it in.
@experimental
-->
<script lang="ts">
  import {
    colorPicker,
    type ColorPickerChannelInputProps,
    type ColorPickerState,
  } from "@ui-sdk/core/color-picker"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { TextPartProps } from "../text-control"

  let {
    channel,
    ...rest
  }: TextPartProps<"input", ColorPickerState> & ColorPickerChannelInputProps =
    $props()

  const id = $props.id()
  const input = usePart(colorPicker, "channel-input", () => ({ id, channel }))
</script>

<Part tag="input" part={input} props={rest} />
