"use client"

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"

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
            <ChevronDownIcon />
          </>
        )}
      </CollapsibleTrigger>
      <CollapsiblePanel render={<ol />}>
        {updates.map((update) => (
          <li data-slot="row" key={update.label}>
            <span>{update.label}</span>
            <span>{update.time}</span>
          </li>
        ))}
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
