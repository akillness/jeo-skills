"use client"

import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/react/resizable"
import { CheckIcon } from "lucide-react"
import * as React from "react"

function Example() {
  const [locked, setLocked] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={locked}
            onCheckedChange={(next) => setLocked(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Lock layout
        </label>
      </div>
      <Resizable disabled={locked}>
        <ResizablePanel minSize={15}>
          <h3>Pinned</h3>
          <span data-slot="hint">2 notes</span>
        </ResizablePanel>
        <ResizableHandle disabled aria-label="Resize pinned" />
        <ResizablePanel minSize={15}>
          <h3>Inbox</h3>
          <span data-slot="hint">3 unread</span>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize inbox" />
        <ResizablePanel minSize={15}>
          <h3>Message</h3>
          <span data-slot="hint">From Kofi Mensah</span>
        </ResizablePanel>
      </Resizable>
    </div>
  )
}

export { Example }
