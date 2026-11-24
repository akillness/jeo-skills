import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul>
          <For each={notes}>{(note) => <li>{note}</li>}</For>
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
