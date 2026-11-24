<!--
@component
One star. Put its icon inside: the snippet gets how full it is, and the
radios that pick its score sit over it.
@experimental
-->
<script lang="ts">
  import {
    rating,
    ratingItemValues,
    type RatingItemState,
  } from "@ui-sdk/core/rating"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { useRatingItem } from "./context"
  import RatingRadio from "./rating-radio.svelte"

  let { children, ...rest }: PartProps<"span", RatingItemState> = $props()

  const item = useRatingItem()
  const part = usePart(rating, "item", () => ({ index: item.index }))
</script>

{#snippet content(state: RatingItemState)}
  {@render children?.(state)}
  {#each ratingItemValues(item.index, item.step()) as score (score)}
    <RatingRadio value={String(score)} />
  {/each}
{/snippet}

<Part tag="span" {part} props={{ ...rest, children: content }} />
