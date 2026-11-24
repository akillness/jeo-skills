<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  WaterfallTick,
  type WaterfallData,
} from "@ui-sdk/vue/waterfall"
import { ref } from "vue"

const trace: WaterfallData = [
  {
    value: "render",
    label: "render /dashboard",
    start: 0,
    duration: 1200,
    children: [
      { value: "session", label: "session", start: 20, duration: 80 },
      { value: "metrics", label: "metrics", start: 110, duration: 640 },
      { value: "alerts", label: "alerts", start: 110, duration: 260 },
      { value: "html", label: "stream html", start: 760, duration: 420 },
    ],
  },
]

const spans = [trace[0], ...trace[0].children!]
const full: [number, number] = [0, 1200]

function zoomed([start, end]: [number, number], factor: number) {
  const center = (start + end) / 2
  const half = Math.min(((end - start) * factor) / 2, full[1] / 2)
  const from = Math.min(Math.max(full[0], center - half), full[1] - half * 2)
  return [from, from + half * 2] as [number, number]
}

const range = ref(full)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="range = zoomed(range, 0.5)">Zoom In</button>
      <button type="button" @click="range = zoomed(range, 2)">Zoom Out</button>
      <button type="button" @click="range = full">Reset</button>
    </div>
    <Waterfall
      aria-label="Dashboard render"
      :items="trace"
      :range="range"
      :default-expanded="['render']"
      default-value="metrics"
    >
      <WaterfallHeaderRow>
        <WaterfallColumnHeader>Span</WaterfallColumnHeader>
        <WaterfallColumnHeader aria-label="Timeline">
          <WaterfallAxis v-slot="{ state }">
            <WaterfallTick
              v-for="tick in state.ticks"
              :key="tick.time"
              :time="tick.time"
            >
              {{ tick.label }}
            </WaterfallTick>
          </WaterfallAxis>
        </WaterfallColumnHeader>
      </WaterfallHeaderRow>
      <WaterfallRow v-for="span in spans" :key="span.value" :value="span.value">
        <WaterfallRowHeader>
          <WaterfallIndicator v-if="span.children">
            <ChevronRightIcon aria-hidden="true" />
          </WaterfallIndicator>
          {{ span.label }}
        </WaterfallRowHeader>
        <WaterfallBar />
      </WaterfallRow>
    </Waterfall>
  </div>
</template>
