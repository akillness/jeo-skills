<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { Rating, RatingItem } from "@ui-sdk/vue/rating"
</script>

<template>
  <Rating
    :value="4.2"
    read-only
    :get-value-label="(value, max) => `Rated ${value} out of ${max}`"
  >
    <RatingItem>
      <StarIcon aria-hidden="true" />
    </RatingItem>
  </Rating>
</template>
