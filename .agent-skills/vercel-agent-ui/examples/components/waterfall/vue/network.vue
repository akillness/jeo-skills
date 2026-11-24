<script setup lang="ts">
import {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallCell,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallMark,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
  type WaterfallBarLabelDetails,
  type WaterfallDataItem,
} from "@ui-sdk/vue/waterfall"

const requests: WaterfallData = [
  { value: "document", label: "/", start: 0, duration: 182 },
  { value: "styles", label: "app.css", start: 190, duration: 96 },
  { value: "script", label: "app.js", start: 192, duration: 410 },
  { value: "font", label: "inter.woff2", start: 300, duration: 220 },
  { value: "user", label: "api/user", start: 610, duration: 240 },
  { value: "avatar", label: "avatar.png", start: 860, duration: 150 },
]

const sizes: Record<string, string> = {
  document: "14 kB",
  styles: "8 kB",
  script: "212 kB",
  font: "48 kB",
  user: "1 kB",
  avatar: "36 kB",
}

const getBarLabel = (
  request: WaterfallDataItem,
  { start, duration }: WaterfallBarLabelDetails
) => `${sizes[request.value]}, starts at ${start}, takes ${duration}`
</script>

<template>
  <Waterfall
    aria-label="Network requests"
    :items="requests"
    :get-bar-label="getBarLabel"
  >
    <WaterfallHeaderRow>
      <WaterfallColumnHeader>Name</WaterfallColumnHeader>
      <WaterfallColumnHeader>Size</WaterfallColumnHeader>
      <WaterfallColumnHeader aria-label="Timeline">
        <WaterfallAxis :max-ticks="5" />
        <WaterfallMark :time="620">DOMContentLoaded</WaterfallMark>
      </WaterfallColumnHeader>
    </WaterfallHeaderRow>
    <WaterfallRow
      v-for="request in requests"
      :key="request.value"
      :value="request.value"
    >
      <WaterfallRowHeader>{{ request.label }}</WaterfallRowHeader>
      <WaterfallCell>{{ sizes[request.value] }}</WaterfallCell>
      <WaterfallBar />
    </WaterfallRow>
  </Waterfall>
</template>
