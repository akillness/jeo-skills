<script setup lang="ts">
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/vue/scroll-area"

const delays = [
  { value: 0, label: "No delay" },
  { value: 2000, label: "2000 ms delay" },
]

const tags = Array.from(
  { length: 20 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)
</script>

<template>
  <div data-slot="grid">
    <div v-for="delay in delays" :key="delay.value" data-slot="stack">
      <span data-slot="hint">{{ delay.label }}</span>
      <ScrollArea type="scroll" :scroll-hide-delay="delay.value">
        <ScrollAreaViewport>
          <ScrollAreaContent>
            <ul>
              <li v-for="tag in tags" :key="tag">{{ tag }}</li>
            </ul>
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar>
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>
    </div>
  </div>
</template>
