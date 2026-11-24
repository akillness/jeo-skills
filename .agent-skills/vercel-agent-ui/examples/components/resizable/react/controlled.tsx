"use client"

import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/react/resizable"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const format = (layout: number[]) => layout.map(Math.round).join(" / ")

function Example() {
  const log = useLog()
  const [layout, setLayout] = React.useState([30, 70])
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setLayout([50, 50])}>
          Split Evenly
        </button>
        <button type="button" onClick={() => setLayout([30, 70])}>
          Reset
        </button>
      </div>
      <Resizable
        layout={layout}
        onLayoutChange={(next, details) => {
          if (format(next) !== format(layout)) {
            log(`${format(next)} (${details.reason})`)
          }
          setLayout(next)
        }}
      >
        <ResizablePanel minSize={20}>
          <h3>Files</h3>
          <ul>
            <li>page.tsx</li>
            <li>layout.tsx</li>
            <li>globals.css</li>
          </ul>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize files" />
        <ResizablePanel minSize={20}>
          <h3>page.tsx</h3>
          <span data-slot="hint">Saved just now</span>
        </ResizablePanel>
      </Resizable>
    </div>
  )
}

export { Example }
