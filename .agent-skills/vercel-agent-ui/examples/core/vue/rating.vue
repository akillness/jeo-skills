<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { createParts } from "@ui-sdk/vue/primitive"
import { ref } from "vue"
import { rating } from "../rating-stages/keyboard"

const { Root: Rating, Star: RatingStar } = createParts(rating, {
  root: "div",
  star: "button",
})

const value = ref(3)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="rating-readout">
      <output data-slot="rating-value" data-value aria-label="Rating out of 5">
        {{ value }}
      </output>
      <span data-slot="hint">out of 5</span>
    </div>
    <Rating v-model:value="value" aria-label="Rating">
      <RatingStar
        v-for="star in 5"
        :key="star"
        :value="String(star)"
        :aria-label="`${star} ${star === 1 ? 'star' : 'stars'}`"
      >
        <StarIcon aria-hidden="true" />
      </RatingStar>
    </Rating>
  </div>
</template>
