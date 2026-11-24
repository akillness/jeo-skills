import * as React from "react"
import { StarIcon } from "lucide-react"
import { createParts } from "@ui-sdk/react/primitive"
import { rating } from "../rating-stages/star"

const { Root: Rating, Star: RatingStar } = createParts(rating, {
  root: "div",
  star: "button",
})

function Example() {
  const [value, setValue] = React.useState(0)

  return (
    <div data-slot="stack">
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating">
          {value}
        </output>
        <span data-slot="hint">Rating</span>
      </div>
      <Rating onValueChange={setValue} aria-label="Rating">
        <RatingStar value="1" aria-label="1 star">
          <StarIcon aria-hidden="true" />
        </RatingStar>
      </Rating>
    </div>
  )
}

export { Example, rating }
