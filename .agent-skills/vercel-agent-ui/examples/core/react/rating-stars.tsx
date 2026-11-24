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
        <output
          data-slot="rating-value"
          data-value
          aria-label="Rating out of 5"
        >
          {value}
        </output>
        <span data-slot="hint">out of 5</span>
      </div>
      <Rating onValueChange={setValue} aria-label="Rating">
        {Array.from({ length: 5 }, (_, index) => (
          <RatingStar
            key={index}
            value={String(index + 1)}
            aria-label={`${index + 1} ${index === 0 ? "star" : "stars"}`}
          >
            <StarIcon aria-hidden="true" />
          </RatingStar>
        ))}
      </Rating>
    </div>
  )
}

export { Example, rating }
