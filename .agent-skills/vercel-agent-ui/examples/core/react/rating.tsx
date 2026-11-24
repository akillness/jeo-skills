import * as React from "react"
import { StarIcon } from "lucide-react"
import {
  createChange,
  createRovingFocus,
  definePrimitive,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type RatingOptions = {
  value?: number
  defaultValue?: number
  onValueChange?: (
    value: number,
    details: ChangeDetails<"item-press" | "list-navigation">
  ) => void
}

const rating = definePrimitive({
  name: "rating",
  options: {
    value: "number",
    defaultValue: "number",
    onValueChange: "callback",
  },
  controlled: ["value"],
  state: (options: RatingOptions) => ({
    value: options.value ?? options.defaultValue ?? 0,
    focused: null as string | null,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus(context, {
      slot: "star",
      key: "focused",
      orientation: () => "both",
      loop: () => true,
      remember: false,
      preferred: (star) => Number(star.key) === context.store.get().value,
      claims: (state, star) =>
        state.value ? Number(star.key) === state.value : star.key === "1",
    })
    return {
      roving,
      rate: (value: number, event?: Event) =>
        change("value", value, { reason: "item-press", event }),
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const moved = roving.keydown(event, el)
        if (moved) {
          change("value", Number(moved.key), {
            reason: "list-navigation",
            event,
          })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "radiogroup" }),
    }),
    star: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        role: "radio",
        "aria-checked": String(Number(part.key) === state.value),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-filled": Number(part.key) <= state.value ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.rate(Number(key), event),
      on: {
        keydown: (event, { el, api }) => {
          if (el) {
            api.keydown(event, el)
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(rating, { root: "div", star: "button" })

const Rating = parts.Root

const RatingStar = parts.Star

function Example() {
  const [value, setValue] = React.useState(3)
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
      <Rating value={value} onValueChange={setValue} aria-label="Rating">
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

export { Example, rating, Rating, RatingStar, type RatingOptions }
