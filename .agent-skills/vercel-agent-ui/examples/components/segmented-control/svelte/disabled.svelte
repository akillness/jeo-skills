<script lang="ts">
  import {
    SegmentedControl,
    SegmentedControlIndicator,
    SegmentedControlItem,
  } from "@ui-sdk/svelte/segmented-control"
</script>

<div data-slot="stack">
  <SegmentedControl aria-label="Theme" defaultValue="system" disabled>
    <SegmentedControlIndicator />
    <SegmentedControlItem value="light">Light</SegmentedControlItem>
    <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
    <SegmentedControlItem value="system">System</SegmentedControlItem>
  </SegmentedControl>
  <SegmentedControl aria-label="Billing period" defaultValue="monthly">
    <SegmentedControlIndicator />
    <SegmentedControlItem value="monthly">Monthly</SegmentedControlItem>
    <SegmentedControlItem value="yearly">Yearly</SegmentedControlItem>
    <SegmentedControlItem value="lifetime" disabled
      >Lifetime</SegmentedControlItem
    >
  </SegmentedControl>
</div>
