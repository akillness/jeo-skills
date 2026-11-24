import { createSignal } from "solid-js"
import { usePrimitive } from "@ui-sdk/solid/primitive"
import { rating } from "../rating-stages/state"

function Example() {
  const [value, setValue] = createSignal(0)
  const handle = usePrimitive(rating, () => ({
    onValueChange: (next: number) => setValue(next),
  }))

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          data-size="sm"
          onClick={(event) => handle.api.rate(3, event)}
        >
          Set to 3
        </button>
        <button
          type="button"
          data-size="sm"
          onClick={(event) => handle.api.rate(0, event)}
        >
          Reset
        </button>
      </div>
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating">
          {value()}
        </output>
        <span data-slot="hint">Rating</span>
      </div>
    </div>
  )
}

export { Example }
