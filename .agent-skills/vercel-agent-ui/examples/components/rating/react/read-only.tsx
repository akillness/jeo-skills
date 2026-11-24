"use client"

import { Rating, RatingItem } from "@ui-sdk/react/rating"
import { StarIcon } from "lucide-react"

function Example() {
  return (
    <Rating
      value={4.2}
      readOnly
      getValueLabel={(value, max) => `Rated ${value} out of ${max}`}
    >
      <RatingItem>
        <StarIcon aria-hidden="true" />
      </RatingItem>
    </Rating>
  )
}

export { Example }
