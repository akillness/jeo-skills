<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon } from "@lucide/vue"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/vue/carousel"

const slides = [1, 2, 3, 4, 5]
</script>

<template>
  <Carousel aria-label="Featured" orientation="vertical">
    <CarouselViewport>
      <CarouselContent>
        <CarouselItem v-for="slide in slides" :key="slide">
          <div data-slot="tile">
            {{ slide }}
          </div>
        </CarouselItem>
      </CarouselContent>
    </CarouselViewport>
    <div data-slot="row">
      <CarouselPrevious aria-label="Previous slide">
        <ChevronUpIcon />
      </CarouselPrevious>
      <CarouselNext aria-label="Next slide">
        <ChevronDownIcon />
      </CarouselNext>
    </div>
  </Carousel>
</template>
