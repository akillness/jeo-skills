<script setup lang="ts">
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@lucide/vue"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/vue/carousel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { ref } from "vue"

type Align = "start" | "center" | "end"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]
const alignments = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

const align = ref<Align>("center")
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <Select
        :items="alignments"
        :value="align"
        @value-change="(next) => next && (align = next as Align)"
      >
        <SelectLabel>Align</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in alignments"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Carousel aria-label="Photos" :align="align" :default-page="2">
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
  </div>
</template>
