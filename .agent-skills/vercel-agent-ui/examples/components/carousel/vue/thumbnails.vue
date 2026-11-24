<script setup lang="ts">
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselViewport,
} from "@ui-sdk/vue/carousel"
import { ref, useTemplateRef, watch } from "vue"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

const page = ref(1)
const strip = useTemplateRef<{ $el: HTMLElement }>("strip")
watch(page, (next) =>
  strip.value?.$el
    .querySelectorAll("button")
    [next - 1]?.scrollIntoView({ block: "nearest", inline: "nearest" })
)
</script>

<template>
  <div data-slot="stack">
    <Carousel v-model:page="page" aria-label="Photos">
      <CarouselViewport>
        <CarouselContent>
          <CarouselItem v-for="photo in photos" :key="photo.name">
            <div data-slot="tile">
              {{ photo.name }}
            </div>
          </CarouselItem>
        </CarouselContent>
      </CarouselViewport>
    </Carousel>
    <Carousel
      ref="strip"
      aria-label="Thumbnails"
      drag-free
      slides-per-page="auto"
    >
      <CarouselViewport>
        <CarouselContent>
          <CarouselItem
            v-for="(photo, index) in photos"
            :key="photo.name"
            :aria-label="photo.name"
          >
            <button
              type="button"
              :aria-pressed="page === index + 1"
              @click="page = index + 1"
            >
              {{ photo.name }}
            </button>
          </CarouselItem>
        </CarouselContent>
      </CarouselViewport>
    </Carousel>
  </div>
</template>
