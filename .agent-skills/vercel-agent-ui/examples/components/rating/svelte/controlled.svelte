<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import {
    createRatingController,
    Rating,
    RatingItem,
  } from "@ui-sdk/svelte/rating"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const rating = createRatingController()
  let value = $state<number | null>(4)
</script>

<div>
  <div data-slot="controls">
    <button type="button" onclick={() => rating.setValue(null)}
      >Clear Rating</button
    >
  </div>
  <Rating
    aria-label="Rating"
    bind:value
    onValueChange={(next, details) => log(`value: ${next} (${details.reason})`)}
    controller={rating}
  >
    <RatingItem>
      <StarIcon aria-hidden="true" />
    </RatingItem>
  </Rating>
</div>
