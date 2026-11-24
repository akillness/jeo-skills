import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"
import { For } from "solid-js"

const updates = [
  { label: "Out for delivery", time: "07:40" },
  { label: "Arrived at the local depot", time: "05:12" },
  { label: "Left the sorting center", time: "Wed 21:03" },
]

function Example() {
  return (
    <Collapsible data-variant="card">
      <CollapsibleTrigger
        render={(props) => (
          <h3>
            <button {...props} />
          </h3>
        )}
      >
        {(state) => (
          <>
            <span data-slot="stack">
              <span>Track parcel</span>
              <span data-slot="hint">
                {state.open ? "3 updates" : "Arrives Thursday"}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </CollapsibleTrigger>
      <CollapsiblePanel render={(props) => <ol {...props} />}>
        <For each={updates}>
          {(update) => (
            <li data-slot="row">
              <span>{update.label}</span>
              <span>{update.time}</span>
            </li>
          )}
        </For>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
