<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  visibleWaterfallRows,
  Waterfall,
  WaterfallBar,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  type ListHighlightDetails,
  type WaterfallData,
} from "@ui-sdk/vue/waterfall"
import { computed, ref } from "vue"

const trace: WaterfallData = Array.from({ length: 2000 }, (_, job) => ({
  value: `job-${job + 1}`,
  label: `job ${job + 1}`,
  start: job * 4,
  duration: 60,
  children: Array.from({ length: 4 }, (_, step) => ({
    value: `job-${job + 1}/step-${step + 1}`,
    label: `step ${step + 1}`,
    start: job * 4 + step * 15,
    duration: 15,
  })),
}))

const row = 32
const height = 288

const scroller = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const expanded = ref(["job-1"])
const rows = computed(() => visibleWaterfallRows(trace, expanded.value))
const visible = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / row) - 4)
  const end = Math.min(
    rows.value.length,
    Math.ceil((scrollTop.value + height) / row) + 4
  )
  return rows.value.slice(start, end)
})

function onHighlight(_value: string, { index }: ListHighlightDetails) {
  const el = scroller.value
  if (!el) {
    return
  }
  const top = index * row
  if (top < el.scrollTop) {
    el.scrollTop = top
  } else if (top + row > el.scrollTop + el.clientHeight) {
    el.scrollTop = top + row - el.clientHeight
  }
  scrollTop.value = el.scrollTop
}
</script>

<template>
  <div
    ref="scroller"
    data-slot="scroll"
    @scroll="scrollTop = ($event.currentTarget as HTMLDivElement).scrollTop"
  >
    <Waterfall
      v-model:expanded="expanded"
      aria-label="Build trace"
      :aria-rowcount="rows.length"
      :items="trace"
      :range="[0, 400]"
      :style="{ height: `${rows.length * row}px` }"
      @highlight="onHighlight"
    >
      <WaterfallRow
        v-for="{ item, index } in visible"
        :key="item.value"
        :value="item.value"
        :aria-rowindex="index + 1"
        :style="{ top: `${index * row}px` }"
      >
        <WaterfallRowHeader>
          <WaterfallIndicator v-if="item.children">
            <ChevronRightIcon aria-hidden="true" />
          </WaterfallIndicator>
          {{ item.label }}
        </WaterfallRowHeader>
        <WaterfallBar />
      </WaterfallRow>
    </Waterfall>
  </div>
</template>
