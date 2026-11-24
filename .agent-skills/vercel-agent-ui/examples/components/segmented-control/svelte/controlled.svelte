<script lang="ts">
  import {
    createSegmentedControlController,
    SegmentedControl,
    SegmentedControlIndicator,
    SegmentedControlItem,
  } from "@ui-sdk/svelte/segmented-control"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const range = createSegmentedControlController()
  let value = $state<string | null>("week")
</script>

<div>
  <div data-slot="controls">
    <button type="button" onclick={() => range.setValue("month")}
      >Show Month</button
    >
  </div>
  <SegmentedControl
    aria-label="Range"
    bind:value
    onValueChange={(next, details) => log(`value: ${next} (${details.reason})`)}
    controller={range}
  >
    <SegmentedControlIndicator />
    <SegmentedControlItem value="day">Day</SegmentedControlItem>
    <SegmentedControlItem value="week">Week</SegmentedControlItem>
    <SegmentedControlItem value="month">Month</SegmentedControlItem>
  </SegmentedControl>
</div>
