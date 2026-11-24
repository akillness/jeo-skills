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
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const slides = [1, 2, 3, 4, 5]

const page = ref(1)
const log = useLog()
</script>

<template>
  <Carousel
    v-model:page="page"
    aria-label="Featured"
    @page-change="
      (next: number, details: { reason: string }) =>
        log(`Page ${next} (${details.reason})`)
    "
  >
    <div data-slot="row">
      <CarouselPrevious aria-label="Previous slide">
        <ChevronLeftIcon />
      </CarouselPrevious>
      <CarouselViewport>
        <CarouselContent>
          <CarouselItem v-for="slide in slides" :key="slide">
            <div data-slot="tile">{{ slide }}</div>
          </CarouselItem>
        </CarouselContent>
      </CarouselViewport>
      <CarouselNext aria-label="Next slide">
        <ChevronRightIcon />
      </CarouselNext>
    </div>
  </Carousel>
</template>
