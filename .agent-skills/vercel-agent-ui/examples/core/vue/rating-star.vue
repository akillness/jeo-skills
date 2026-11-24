<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { createParts } from "@ui-sdk/vue/primitive"
import { ref } from "vue"
import { rating } from "../rating-stages/star"

const { Root: Rating, Star: RatingStar } = createParts(rating, {
  root: "div",
  star: "button",
})

const value = ref(0)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="rating-readout">
      <output data-slot="rating-value" data-value aria-label="Rating">
        {{ value }}
      </output>
      <span data-slot="hint">Rating</span>
    </div>
    <Rating aria-label="Rating" @value-change="(next) => (value = next)">
      <RatingStar value="1" aria-label="1 star">
        <StarIcon aria-hidden="true" />
      </RatingStar>
    </Rating>
  </div>
</template>
