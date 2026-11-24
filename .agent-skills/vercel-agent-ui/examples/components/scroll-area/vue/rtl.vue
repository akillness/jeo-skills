<script setup lang="ts">
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/vue/scroll-area"

const tags = Array.from({ length: 40 }, (_, index) => `وسم ${index + 1}`)
</script>

<template>
  <div dir="rtl">
    <ScrollArea>
      <ScrollAreaViewport>
        <ScrollAreaContent>
          <h4>الوسوم</h4>
          <div v-for="tag in tags" :key="tag">
            {{ tag }}
          </div>
        </ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar>
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
    </ScrollArea>
  </div>
</template>
