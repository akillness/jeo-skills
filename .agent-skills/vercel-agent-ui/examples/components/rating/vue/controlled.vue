<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { createRatingController, Rating, RatingItem } from "@ui-sdk/vue/rating"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const rating = createRatingController()
const value = ref<number | null>(4)
</script>

<template>
  <div>
    <div data-slot="controls">
      <button type="button" @click="rating.setValue(null)">Clear Rating</button>
    </div>
    <Rating
      v-model:value="value"
      aria-label="Rating"
      :controller="rating"
      @value-change="
        (next, details) => log(`value: ${next} (${details.reason})`)
      "
    >
      <RatingItem>
        <StarIcon aria-hidden="true" />
      </RatingItem>
    </Rating>
  </div>
</template>
