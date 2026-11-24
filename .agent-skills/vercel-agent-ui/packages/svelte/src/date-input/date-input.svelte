<!--
@component
The root: a group of segments the locale orders, like month, day and year,
and the hidden input the ISO value submits with. Without children it
renders every segment; its children snippet receives its state and can
render `state.segments`.
@stable
-->
<script lang="ts">
  import {
    dateInput,
    type DateInputOptions,
    type DateInputState,
  } from "@ui-sdk/core/date-input"
  import type { PartProps } from "../use-primitive.svelte"
  import DateInputSegment from "./date-input-segment.svelte"
  import SegmentedInput from "./segmented-input.svelte"

  let {
    value = $bindable(),
    ...rest
  }: PartProps<"div", DateInputState> &
    Omit<DateInputOptions, "value"> & {
      /** The ISO date, or date and time, or null while empty. Bind it with `bind:value` to control the input. */
      value?: string | null
    } = $props()
</script>

<SegmentedInput
  primitive={dateInput}
  Segment={DateInputSegment}
  bind:value
  {...rest}
/>
