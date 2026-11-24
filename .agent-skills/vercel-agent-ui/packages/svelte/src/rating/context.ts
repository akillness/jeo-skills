import { getContext } from "svelte"

const ItemKey = Symbol("rating-item")

type RatingItemContext = { index: number; step: () => number }

function useRatingItem() {
  const context = getContext<RatingItemContext | undefined>(ItemKey)
  if (!context) {
    throw new Error("RatingItem must be used inside <Rating>.")
  }
  return context
}

export { ItemKey, type RatingItemContext, useRatingItem }
