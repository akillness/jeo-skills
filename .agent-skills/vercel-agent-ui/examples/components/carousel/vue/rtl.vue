<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from "@lucide/vue"
import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/vue/carousel"

const slides = [1, 2, 3, 4, 5]
</script>

<template>
  <div dir="rtl">
    <Carousel aria-label="مميز">
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
        <CarouselPrevious aria-label="الشريحة السابقة">
          <ChevronLeftIcon />
        </CarouselPrevious>
        <CarouselIndicatorGroup aria-label="اختر شريحة">
          <CarouselIndicator
            v-for="slide in slides"
            :key="slide"
            :page="slide"
            :aria-label="`الشريحة ${slide}`"
          />
        </CarouselIndicatorGroup>
        <CarouselNext aria-label="الشريحة التالية">
          <ChevronRightIcon />
        </CarouselNext>
      </div>
    </Carousel>
  </div>
</template>
