<script setup lang="ts">
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/vue/segmented-control"
</script>

<template>
  <div data-slot="stack">
    <SegmentedControl aria-label="Theme" default-value="system" disabled>
      <SegmentedControlIndicator />
      <SegmentedControlItem value="light">Light</SegmentedControlItem>
      <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
      <SegmentedControlItem value="system">System</SegmentedControlItem>
    </SegmentedControl>
    <SegmentedControl aria-label="Billing period" default-value="monthly">
      <SegmentedControlIndicator />
      <SegmentedControlItem value="monthly">Monthly</SegmentedControlItem>
      <SegmentedControlItem value="yearly">Yearly</SegmentedControlItem>
      <SegmentedControlItem value="lifetime" disabled
        >Lifetime</SegmentedControlItem
      >
    </SegmentedControl>
  </div>
</template>
