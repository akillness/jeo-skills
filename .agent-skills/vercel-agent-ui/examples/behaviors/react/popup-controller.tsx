import * as React from "react"
import {
  createPopoverController,
  Popover,
  PopoverContent,
} from "@ui-sdk/react/popover"
import { useLog } from "../../shared/react/log"

type Spot = { x: number; y: number }

const note = createPopoverController<Spot>()

function Example() {
  const [timed, setTimed] = React.useState(false)
  const log = useLog()
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={timed}
            onChange={(event) => setTimed(event.target.checked)}
          />
          Close by itself
        </label>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Card"
        onClick={async (event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const result = await note.open({
            anchor: { x: event.clientX, y: event.clientY },
            payload: {
              x: Math.round(event.clientX - box.left),
              y: Math.round(event.clientY - box.top),
            },
            signal: timed ? AbortSignal.timeout(2000) : undefined,
          })
          log(
            `Closed by ${result.reason} (${result.source})${result.returnValue ? `, ${result.returnValue}` : ""}`
          )
        }}
        data-slot="popup-surface"
      >
        Click to leave a note
      </div>
      <Popover controller={note}>
        <PopoverContent<Spot> align="start" sideOffset={4}>
          {(state) => {
            const spot = state.payload
            return (
              <>
                <p data-spot>{spot ? `A note at ${spot.x}, ${spot.y}` : ""}</p>
                <button
                  type="button"
                  data-variant="solid"
                  data-size="sm"
                  onClick={() => note.close({ returnValue: "kept" })}
                >
                  Keep
                </button>
              </>
            )
          }}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example, note, type Spot }
