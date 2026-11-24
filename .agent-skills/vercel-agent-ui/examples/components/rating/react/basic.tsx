"use client"

import { Rating, RatingItem } from "@ui-sdk/react/rating"
import { StarIcon } from "lucide-react"

function Example() {
  return (
    <Rating aria-label="Rating" defaultValue={3}>
      <RatingItem>
        <StarIcon aria-hidden="true" />
      </RatingItem>
    </Rating>
  )
}

export { Example }
