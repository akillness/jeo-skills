"use client"

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  createCollapsibleController,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"
import * as React from "react"

const recoveryCodes = ["7KQ2-M9XD", "P4TR-8HZC", "W3NB-6JUE", "C5YF-2LSA"]

function Example() {
  const log = useLog()
  const [collapsible] = React.useState(createCollapsibleController)
  const [open, setOpen] = React.useState(false)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => collapsible.toggle()}>
          Toggle
        </button>
      </div>
      <Collapsible
        data-variant="card"
        open={open}
        onOpenChange={(next, details) => {
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
        controller={collapsible}
      >
        <CollapsibleTrigger>
          <span data-slot="stack">
            <span>Recovery codes</span>
            <span data-slot="hint">Each code signs you in once</span>
          </span>
          <ChevronDownIcon />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div data-slot="stack">
            <ul>
              {recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <button type="button" onClick={() => collapsible.close()}>
              Done
            </button>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  )
}

export { Example }
