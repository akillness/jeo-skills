<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
  createCarouselController,
} from "@ui-sdk/vue/carousel"

const slides = [1, 2, 3, 4, 5]

const carousel = createCarouselController()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <CarouselPrevious :controller="carousel" aria-label="Previous slide">
        <ChevronLeftIcon />
      </CarouselPrevious>
      <CarouselNext :controller="carousel" aria-label="Next slide">
        <ChevronRightIcon />
      </CarouselNext>
      <button type="button" @click="carousel.setPage(5)">
        Show the Last Slide
      </button>
    </div>
    <Carousel aria-label="Featured" :controller="carousel" :drag="false">
      <CarouselViewport>
        <CarouselContent>
          <CarouselItem v-for="slide in slides" :key="slide">
            <div data-slot="tile">{{ slide }}</div>
          </CarouselItem>
        </CarouselContent>
      </CarouselViewport>
    </Carousel>
  </div>
</template>
