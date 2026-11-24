import * as React from "react"
import { createParts } from "@ui-sdk/react/primitive"
import { sortable } from "../sortable"

const {
  Root: Sortable,
  Item: SortableItem,
  Handle: SortableHandle,
  Instructions: SortableInstructions,
} = createParts(sortable, {
  root: "div",
  item: "div",
  handle: "span",
  instructions: "div",
})

const tracks: Record<
  string,
  { title: string; artist: string; length: string }
> = {
  t1: { title: "Northern Lights", artist: "Halden", length: "3:42" },
  t2: { title: "Glass Harbor", artist: "Mira Vale", length: "4:05" },
  t3: { title: "Copper Sky", artist: "The Fieldnotes", length: "2:58" },
  t4: { title: "Ash and Ember", artist: "Halden", length: "3:17" },
  t5: { title: "Slow Tide", artist: "Oona Reyes", length: "5:01" },
  t6: { title: "Paper Moons", artist: "Mira Vale", length: "3:33" },
}

const photos: Record<string, { label: string; tone: string }> = {
  p1: { label: "Dunes", tone: "#f97316" },
  p2: { label: "Fjord", tone: "#6366f1" },
  p3: { label: "Meadow", tone: "#10b981" },
  p4: { label: "Dusk", tone: "#9333ea" },
  p5: { label: "Glacier", tone: "#0ea5e9" },
  p6: { label: "Canyon", tone: "#dc2626" },
  p7: { label: "Forest", tone: "#15803d" },
  p8: { label: "Harbor", tone: "#475569" },
  p9: { label: "Lagoon", tone: "#0891b2" },
}

function Example() {
  const [playlist, setPlaylist] = React.useState(Object.keys(tracks))
  return (
    <div data-slot="sortable-layout">
      <div data-slot="stack">
        <div data-slot="row">
          <button
            type="button"
            data-size="sm"
            onClick={() =>
              setPlaylist(
                [...playlist].sort((a, b) =>
                  tracks[a].title.localeCompare(tracks[b].title)
                )
              )
            }
          >
            Sort by title
          </button>
          <button
            type="button"
            data-size="sm"
            onClick={() => setPlaylist([...playlist].reverse())}
          >
            Reverse
          </button>
        </div>
        <Sortable
          value={playlist}
          onValueChange={setPlaylist}
          aria-label="Playlist"
        >
          {({ order }) => (
            <>
              {order.map((key, index) => (
                <SortableItem key={key} value={key}>
                  <SortableHandle>
                    <svg
                      viewBox="0 0 16 16"
                      width="16"
                      height="16"
                      fill="currentColor"
                    >
                      {[4, 8, 12].flatMap((y) =>
                        [6, 10].map((x) => (
                          <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" />
                        ))
                      )}
                    </svg>
                  </SortableHandle>
                  <span data-slot="sortable-index">{index + 1}</span>
                  <span data-slot="stack">
                    <span>{tracks[key].title}</span>
                    <span data-slot="hint">{tracks[key].artist}</span>
                  </span>
                  <span data-slot="hint">{tracks[key].length}</span>
                </SortableItem>
              ))}
              <SortableInstructions>
                Space picks up the focused track, or every selected track; then
                Up and Down move them, Space drops them and Escape puts them
                back. Shift with an arrow selects, Control or Command with A
                selects all.
              </SortableInstructions>
            </>
          )}
        </Sortable>
      </div>
      <Sortable
        defaultValue={Object.keys(photos)}
        orientation="grid"
        aria-label="Photos"
      >
        {({ order }) => (
          <>
            {order.map((key) => (
              <SortableItem
                key={key}
                value={key}
                style={{ "--tone": photos[key].tone } as React.CSSProperties}
              >
                {photos[key].label}
              </SortableItem>
            ))}
            <SortableInstructions>
              Space picks up the focused photo, or every selected photo; then
              the arrows move them, Space drops them and Escape puts them back.
            </SortableInstructions>
          </>
        )}
      </Sortable>
    </div>
  )
}

export { Example, Sortable, SortableHandle, SortableInstructions, SortableItem }
