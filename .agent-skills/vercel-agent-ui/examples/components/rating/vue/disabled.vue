<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { Rating, RatingItem } from "@ui-sdk/vue/rating"
</script>

<template>
  <Rating aria-label="Rating" :default-value="2" disabled>
    <RatingItem>
      <StarIcon aria-hidden="true" />
    </RatingItem>
  </Rating>
</template>
