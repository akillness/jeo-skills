<script setup lang="ts">
import {
  createSegmentedControlController,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/vue/segmented-control"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const range = createSegmentedControlController()
const value = ref<string | null>("week")
</script>

<template>
  <div>
    <div data-slot="controls">
      <button type="button" @click="range.setValue('month')">Show Month</button>
    </div>
    <SegmentedControl
      v-model:value="value"
      aria-label="Range"
      :controller="range"
      @value-change="
        (next, details) => log(`value: ${next} (${details.reason})`)
      "
    >
      <SegmentedControlIndicator />
      <SegmentedControlItem value="day">Day</SegmentedControlItem>
      <SegmentedControlItem value="week">Week</SegmentedControlItem>
      <SegmentedControlItem value="month">Month</SegmentedControlItem>
    </SegmentedControl>
  </div>
</template>
