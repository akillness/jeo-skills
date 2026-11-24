<script setup lang="ts">
import { createParts } from "@ui-sdk/vue/primitive"
import { ref } from "vue"
import { sortable } from "../sortable"

const {
  Root: Sortable,
  Item: SortableItem,
  Handle: SortableHandle,
  Instructions: SortableInstructions,
} = createParts(sortable, {
  root: "div",
  item: "div",
  handle: "span",
  instructions: "div",
})

const tracks: Record<
  string,
  { title: string; artist: string; length: string }
> = {
  t1: { title: "Northern Lights", artist: "Halden", length: "3:42" },
  t2: { title: "Glass Harbor", artist: "Mira Vale", length: "4:05" },
  t3: { title: "Copper Sky", artist: "The Fieldnotes", length: "2:58" },
  t4: { title: "Ash and Ember", artist: "Halden", length: "3:17" },
  t5: { title: "Slow Tide", artist: "Oona Reyes", length: "5:01" },
  t6: { title: "Paper Moons", artist: "Mira Vale", length: "3:33" },
}

const photos: Record<string, { label: string; tone: string }> = {
  p1: { label: "Dunes", tone: "#f97316" },
  p2: { label: "Fjord", tone: "#6366f1" },
  p3: { label: "Meadow", tone: "#10b981" },
  p4: { label: "Dusk", tone: "#9333ea" },
  p5: { label: "Glacier", tone: "#0ea5e9" },
  p6: { label: "Canyon", tone: "#dc2626" },
  p7: { label: "Forest", tone: "#15803d" },
  p8: { label: "Harbor", tone: "#475569" },
  p9: { label: "Lagoon", tone: "#0891b2" },
}

const playlist = ref(Object.keys(tracks))
const photoOrder = Object.keys(photos)
const sortByTitle = () =>
  (playlist.value = [...playlist.value].sort((a, b) =>
    tracks[a].title.localeCompare(tracks[b].title)
  ))
const reverse = () => (playlist.value = [...playlist.value].reverse())
</script>

<template>
  <div data-slot="sortable-layout">
    <div data-slot="stack">
      <div data-slot="row">
        <button type="button" data-size="sm" @click="sortByTitle">
          Sort by title
        </button>
        <button type="button" data-size="sm" @click="reverse">Reverse</button>
      </div>
      <Sortable
        v-slot="{ state }"
        v-model:value="playlist"
        aria-label="Playlist"
      >
        <SortableItem
          v-for="(key, index) in state.order"
          :key="key"
          :value="key"
        >
          <SortableHandle>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <template v-for="y in [4, 8, 12]" :key="y">
                <circle v-for="x in [6, 10]" :key="x" :cx="x" :cy="y" r="1.2" />
              </template>
            </svg>
          </SortableHandle>
          <span data-slot="sortable-index">{{ index + 1 }}</span>
          <span data-slot="stack">
            <span>{{ tracks[key].title }}</span>
            <span data-slot="hint">{{ tracks[key].artist }}</span>
          </span>
          <span data-slot="hint">{{ tracks[key].length }}</span>
        </SortableItem>
        <SortableInstructions>
          Space picks up the focused track, or every selected track; then Up and
          Down move them, Space drops them and Escape puts them back. Shift with
          an arrow selects, Control or Command with A selects all.
        </SortableInstructions>
      </Sortable>
    </div>
    <Sortable
      v-slot="{ state }"
      :default-value="photoOrder"
      orientation="grid"
      aria-label="Photos"
    >
      <SortableItem
        v-for="key in state.order"
        :key="key"
        :value="key"
        :style="{ '--tone': photos[key].tone }"
      >
        {{ photos[key].label }}
      </SortableItem>
      <SortableInstructions>
        Space picks up the focused photo, or every selected photo; then the
        arrows move them, Space drops them and Escape puts them back.
      </SortableInstructions>
    </Sortable>
  </div>
</template>
