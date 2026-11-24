<script setup lang="ts">
import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
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
</script>

<template>
  <Carousel aria-label="Photos">
    <CarouselViewport>
      <CarouselContent>
        <CarouselItem v-for="photo in photos" :key="photo.name">
          <div data-slot="tile">
            {{ photo.name }}
          </div>
        </CarouselItem>
      </CarouselContent>
    </CarouselViewport>
    <CarouselIndicatorGroup aria-label="Choose a photo">
      <CarouselIndicator
        v-for="(photo, index) in photos"
        :key="photo.name"
        :page="index + 1"
        :aria-label="photo.name"
      />
    </CarouselIndicatorGroup>
  </Carousel>
</template>
