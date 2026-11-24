"use client"

import { Rating, RatingItem } from "@ui-sdk/react/rating"
import { StarIcon } from "lucide-react"

function Example() {
  return (
    <Rating aria-label="Rating" step={0.5} defaultValue={3.5}>
      <RatingItem>
        <StarIcon aria-hidden="true" />
      </RatingItem>
    </Rating>
  )
}

export { Example }
