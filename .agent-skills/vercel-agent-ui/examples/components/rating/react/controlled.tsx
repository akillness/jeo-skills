"use client"

import {
  createRatingController,
  Rating,
  RatingItem,
} from "@ui-sdk/react/rating"
import { StarIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [rating] = React.useState(() => createRatingController())
  const [value, setValue] = React.useState<number | null>(4)

  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => rating.setValue(null)}>
          Clear Rating
        </button>
      </div>
      <Rating
        aria-label="Rating"
        value={value}
        onValueChange={(next, details) => {
          setValue(next)
          log(`value: ${next} (${details.reason})`)
        }}
        controller={rating}
      >
        <RatingItem>
          <StarIcon aria-hidden="true" />
        </RatingItem>
      </Rating>
    </div>
  )
}

export { Example }
