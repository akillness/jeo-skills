import { createSignal } from "solid-js"
import { createParts } from "@ui-sdk/solid/primitive"
import { rating } from "../rating-stages/focus"

const { Root: Rating, Star: RatingStar } = createParts(rating, {
  root: "div",
  star: "button",
})

function StarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  )
}

function Example() {
  const [value, setValue] = createSignal(0)

  return (
    <div data-slot="stack">
      <div data-slot="rating-readout">
        <output
          data-slot="rating-value"
          data-value
          aria-label="Rating out of 5"
        >
          {value()}
        </output>
        <span data-slot="hint">out of 5</span>
      </div>
      <Rating onValueChange={(next) => setValue(next)} aria-label="Rating">
        {Array.from({ length: 5 }, (_, index) => (
          <RatingStar
            value={String(index + 1)}
            aria-label={`${index + 1} ${index === 0 ? "star" : "stars"}`}
          >
            <StarIcon />
          </RatingStar>
        ))}
      </Rating>
    </div>
  )
}

export { Example }
