"use client"

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const notes = [
  "Search now matches file contents, not only names.",
  "Shared links remember the folder they were opened from.",
  "Uploads resume after the connection drops.",
]

function Example() {
  const log = useLog()
  return (
    <Collapsible
      data-variant="card"
      onOpenChangeComplete={(open) =>
        log(open ? "Finished opening" : "Finished closing")
      }
    >
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Release notes</span>
          <span data-slot="hint">Version 2.4, released October 28</span>
        </span>
        <ChevronDownIcon />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
