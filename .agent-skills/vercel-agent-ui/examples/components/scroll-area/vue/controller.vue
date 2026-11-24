<script setup lang="ts">
import {
  createScrollAreaController,
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/vue/scroll-area"
import { useLog } from "../../../shared/vue/log"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

const log = useLog()
const controller = createScrollAreaController()
let edge: string | null = "start"

function read() {
  const next = controller.isAtEnd()
    ? "end"
    : controller.isAtStart()
      ? "start"
      : null
  if (next && next !== edge) {
    log(`At the ${next}`)
  }
  edge = next
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button
        type="button"
        @click="controller.scrollToStart({ behavior: 'smooth' })"
      >
        Back to Top
      </button>
      <button
        type="button"
        @click="controller.scrollToEnd({ behavior: 'instant' })"
      >
        Jump to the End
      </button>
    </div>
    <ScrollArea :controller="controller">
      <ScrollAreaViewport role="region" aria-label="Tags" @scroll="read">
        <ScrollAreaContent>
          <h3>Tags</h3>
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
</template>
