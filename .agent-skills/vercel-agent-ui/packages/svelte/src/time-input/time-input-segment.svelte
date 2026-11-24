<!--
@component
A segment, like the hour: an input arrow keys step and digits fill, named
by its unit. The text between segments renders as a span.
@stable
-->
<script lang="ts">
  import type { dateInput } from "@ui-sdk/core/date-input"
  import {
    timeInput,
    type TimeInputSegmentProps,
    type TimeInputSegmentState,
  } from "@ui-sdk/core/time-input"
  import Segment from "../date-input/segment.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"input", TimeInputSegmentState> & TimeInputSegmentProps =
    $props()
</script>

<Segment primitive={timeInput as unknown as typeof dateInput} {...props} />
