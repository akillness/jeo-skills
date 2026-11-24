<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import { Rating, RatingItem } from "@ui-sdk/svelte/rating"
</script>

<Rating
  value={4.2}
  readOnly
  getValueLabel={(value, max) => `Rated ${value} out of ${max}`}
>
  <RatingItem>
    <StarIcon aria-hidden="true" />
  </RatingItem>
</Rating>
