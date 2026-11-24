<script setup lang="ts">
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/vue/tabs"
import { ref } from "vue"

const orientations = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
] as const

const orientation = ref<"horizontal" | "vertical">("horizontal")
</script>

<template>
  <div>
    <div data-slot="controls" role="group" aria-label="Orientation">
      <button
        v-for="option in orientations"
        :key="option.value"
        type="button"
        data-size="sm"
        :aria-pressed="orientation === option.value"
        @click="orientation = option.value"
      >
        {{ option.label }}
      </button>
    </div>
    <Tabs default-value="music" :orientation="orientation">
      <TabsList aria-label="Library">
        <TabsTab value="music">Music</TabsTab>
        <TabsTab value="podcasts">Podcasts</TabsTab>
        <TabsTab value="audiobooks">Audiobooks</TabsTab>
        <TabsIndicator />
      </TabsList>
      <TabsPanel value="music"
        >312 songs in 24 albums, synced to this device.</TabsPanel
      >
      <TabsPanel value="podcasts"
        >8 shows you follow, with 3 new episodes.</TabsPanel
      >
      <TabsPanel value="audiobooks"
        >2 books in progress, 6 hours left in total.</TabsPanel
      >
    </Tabs>
  </div>
</template>
