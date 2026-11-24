<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { Rating, RatingItem } from "@ui-sdk/vue/rating"
</script>

<template>
  <Rating aria-label="Rating" :step="0.5" :default-value="3.5">
    <RatingItem>
      <StarIcon aria-hidden="true" />
    </RatingItem>
  </Rating>
</template>
