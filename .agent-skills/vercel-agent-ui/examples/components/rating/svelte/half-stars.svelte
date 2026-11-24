<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import { Rating, RatingItem } from "@ui-sdk/svelte/rating"
</script>

<Rating aria-label="Rating" step={0.5} defaultValue={3.5}>
  <RatingItem>
    <StarIcon aria-hidden="true" />
  </RatingItem>
</Rating>
