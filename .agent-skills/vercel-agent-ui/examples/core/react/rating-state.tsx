import * as React from "react"
import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import { usePrimitive } from "@ui-sdk/react/primitive"

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
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  api: (context) => {
    const change = createChange(context)

    return {
      rate: (value: number, event?: Event) =>
        change("value", value, { reason: "item-press", event }),
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "radiogroup" }),
    }),
  }),
})

function Example() {
  const handle = usePrimitive(rating, {})
  const state = React.useSyncExternalStore(
    handle.instance.subscribe,
    handle.instance.get,
    handle.instance.get
  )

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          data-size="sm"
          onClick={(event) => handle.api.rate(3, event.nativeEvent)}
        >
          Set to 3
        </button>
        <button
          type="button"
          data-size="sm"
          onClick={(event) => handle.api.rate(0, event.nativeEvent)}
        >
          Reset
        </button>
      </div>
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating">
          {state.value}
        </output>
        <span data-slot="hint">Rating</span>
      </div>
    </div>
  )
}

export { Example, rating }
