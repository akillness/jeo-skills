<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/vue/carousel"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

const nextFocused = () =>
  typeof document !== "undefined" &&
  document.activeElement?.getAttribute("data-slot") === "carousel-next"
const focusIf = (focus: boolean) => (link: unknown) => {
  if (focus) {
    ;(link as HTMLElement | null)?.focus()
  }
}
</script>

<template>
  <Carousel aria-label="Photos">
    <CarouselViewport>
      <CarouselContent>
        <CarouselItem
          v-for="photo in photos"
          :key="photo.name"
          v-slot="{ state }"
        >
          <div data-slot="tile">
            {{ photo.name }}
            <span data-slot="hint">
              {{ state.index + 1 }} / {{ photos.length
              }}{{ state.active ? " · showing" : "" }}
            </span>
          </div>
        </CarouselItem>
      </CarouselContent>
    </CarouselViewport>
    <div data-slot="row">
      <CarouselPrevious>
        <ChevronLeftIcon />
        Previous
      </CarouselPrevious>
      <CarouselNext>
        <template #render="{ props, state }">
          <a
            v-if="state.disabled"
            :ref="focusIf(nextFocused())"
            href="https://example.com/gallery"
            >See all photos</a
          >
          <button v-else v-bind="props">
            Next
            <ChevronRightIcon />
          </button>
        </template>
      </CarouselNext>
    </div>
  </Carousel>
</template>
