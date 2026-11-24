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
    <output data-slot="rating-value" data-value aria-label="Rating out of 5">
      {value}
    </output>
    <span data-slot="hint">out of 5</span>
  </div>
  <Rating onValueChange={(next) => (value = next)} aria-label="Rating">
    {#each Array.from({ length: 5 }, (_, index) => index + 1) as star (star)}
      <RatingStar
        value={String(star)}
        aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
      >
        <StarIcon aria-hidden="true" />
      </RatingStar>
    {/each}
  </Rating>
</div>
