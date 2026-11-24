<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import { createParts } from "@ui-sdk/svelte/primitive"
  import { rating } from "../rating-stages/star"

  const { Root: Rating, Star: RatingStar } = createParts(rating, {
    root: "div",
    star: "button",
  })

  let value = $state(0)
</script>

<div data-slot="stack">
  <div data-slot="rating-readout">
    <output data-slot="rating-value" data-value aria-label="Rating">
      {value}
    </output>
    <span data-slot="hint">Rating</span>
  </div>
  <Rating onValueChange={(next) => (value = next)} aria-label="Rating">
    <RatingStar value="1" aria-label="1 star">
      <StarIcon aria-hidden="true" />
    </RatingStar>
  </Rating>
</div>
