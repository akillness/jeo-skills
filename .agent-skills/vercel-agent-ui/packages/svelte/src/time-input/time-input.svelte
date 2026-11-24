<!--
@component
The root: a group of segments, hours and minutes, with seconds and AM/PM
when shown, and the hidden input the time submits with. Without children
it renders every segment; its children snippet receives its state and can
render `state.segments`.
@stable
-->
<script lang="ts">
  import type { dateInput } from "@ui-sdk/core/date-input"
  import {
    timeInput,
    type TimeInputOptions,
    type TimeInputState,
  } from "@ui-sdk/core/time-input"
  import SegmentedInput from "../date-input/segmented-input.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import TimeInputSegment from "./time-input-segment.svelte"

  let {
    value = $bindable(),
    ...rest
  }: PartProps<"div", TimeInputState> &
    Omit<TimeInputOptions, "value"> & {
      /** The time, like `14:30`, or null while empty. Bind it with `bind:value` to control the input. */
      value?: string | null
    } = $props()

  const primitive = timeInput as unknown as typeof dateInput
</script>

<SegmentedInput {primitive} Segment={TimeInputSegment} bind:value {...rest} />
