<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import { Rating, RatingItem } from "@ui-sdk/svelte/rating"
</script>

<Rating aria-label="Rating" defaultValue={3}>
  <RatingItem>
    <StarIcon aria-hidden="true" />
  </RatingItem>
</Rating>
