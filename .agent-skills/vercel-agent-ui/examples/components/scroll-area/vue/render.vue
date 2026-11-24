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
    <template #render="{ props, children }">
      <section v-bind="props"><component :is="children" /></section>
    </template>
    <template #default="{ state }">
      <ScrollAreaViewport aria-label="Releases">
        <template #render="{ props, children }">
          <article v-bind="props"><component :is="children" /></article>
        </template>
        <ScrollAreaContent>
          <ul>
            <li v-for="tag in tags" :key="tag">{{ tag }}</li>
          </ul>
        </ScrollAreaContent>
      </ScrollAreaViewport>
      <p data-slot="hint" aria-hidden="true">
        {{
          state.atStart ? "Scroll for older releases" : "More releases below"
        }}
      </p>
      <ScrollAreaScrollbar>
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
    </template>
  </ScrollArea>
</template>
