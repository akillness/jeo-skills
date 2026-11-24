<script setup lang="ts">
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/vue/scroll-area"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)
</script>

<template>
  <ScrollArea>
    <ScrollAreaViewport role="region" aria-label="Tags">
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
</template>
