<script setup lang="ts">
import { ChevronRightIcon } from "@lucide/vue"
import {
  createWaterfallController,
  visibleWaterfallRows,
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
} from "@ui-sdk/vue/waterfall"
import { computed, ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const trace: WaterfallData = [
  {
    value: "checkout",
    label: "POST /checkout",
    start: 0,
    duration: 920,
    children: [
      { value: "auth", label: "auth.verify", start: 12, duration: 64 },
      {
        value: "cart",
        label: "cart.load",
        start: 80,
        duration: 310,
        children: [
          {
            value: "cart-db",
            label: "db.query carts",
            start: 96,
            duration: 140,
          },
          {
            value: "prices",
            label: "pricing.quote",
            start: 240,
            duration: 136,
          },
        ],
      },
      {
        value: "payment",
        label: "payments.charge",
        start: 400,
        duration: 470,
        children: [
          { value: "fraud", label: "fraud.score", start: 410, duration: 120 },
          {
            value: "gateway",
            label: "gateway.capture",
            start: 540,
            duration: 310,
          },
        ],
      },
      { value: "email", label: "email.enqueue", start: 880, duration: 30 },
    ],
  },
]

const log = useLog()
const spans = createWaterfallController()
const expanded = ref(["checkout"])
const value = ref<string | null>(null)
const rows = computed(() => visibleWaterfallRows(trace, expanded.value))
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="spans.expandAll()">Expand All</button>
      <button type="button" @click="spans.collapseAll()">Collapse All</button>
    </div>
    <Waterfall
      v-model:expanded="expanded"
      v-model:value="value"
      aria-label="Checkout trace"
      :items="trace"
      :controller="spans"
      :format="{ style: 'unit', unit: 'millisecond', unitDisplay: 'narrow' }"
      @value-change="(next: string | null) => log(`Selected ${next}`)"
    >
      <WaterfallHeaderRow>
        <WaterfallColumnHeader>Span</WaterfallColumnHeader>
        <WaterfallColumnHeader aria-label="Timeline">
          <WaterfallAxis />
        </WaterfallColumnHeader>
      </WaterfallHeaderRow>
      <WaterfallRow
        v-for="{ item } in rows"
        :key="item.value"
        :value="item.value"
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
