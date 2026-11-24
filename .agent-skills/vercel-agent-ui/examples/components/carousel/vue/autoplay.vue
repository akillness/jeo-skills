<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/vue/carousel"
import { useLog } from "../../../shared/vue/log"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]

const log = useLog()
</script>

<template>
  <Carousel
    aria-label="Photos"
    default-playing
    :interval="4000"
    @playing-change="
      (playing: boolean, details: { reason: string }) =>
        log(`${playing ? 'Playing' : 'Stopped'} (${details.reason})`)
    "
  >
    <div data-slot="controls">
      <CarouselPlayToggle v-slot="{ state }">{{
        state.playing ? "Pause" : "Play"
      }}</CarouselPlayToggle>
    </div>
    <div data-slot="row">
      <CarouselPrevious aria-label="Previous slide">
        <ChevronLeftIcon />
      </CarouselPrevious>
      <CarouselViewport>
        <CarouselContent>
          <CarouselItem v-for="photo in photos" :key="photo.name">
            <div data-slot="tile">{{ photo.name }}</div>
          </CarouselItem>
        </CarouselContent>
      </CarouselViewport>
      <CarouselNext aria-label="Next slide">
        <ChevronRightIcon />
      </CarouselNext>
    </div>
  </Carousel>
</template>
