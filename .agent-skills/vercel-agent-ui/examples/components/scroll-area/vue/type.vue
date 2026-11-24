<script setup lang="ts">
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
  type ScrollAreaType,
} from "@ui-sdk/vue/scroll-area"

const types: ScrollAreaType[] = ["hover", "scroll", "auto", "always"]

const tags = Array.from(
  { length: 20 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)
</script>

<template>
  <div data-slot="grid">
    <div v-for="type in types" :key="type" data-slot="stack">
      <code>type="{{ type }}"</code>
      <ScrollArea :type="type">
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
