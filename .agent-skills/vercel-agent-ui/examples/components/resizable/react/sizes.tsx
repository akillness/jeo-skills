"use client"

import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/react/resizable"

function Example() {
  return (
    <Resizable>
      <ResizablePanel defaultSize="200px" minSize="160px" maxSize="320px">
        <h3>Docs</h3>
        <ul>
          <li>Getting Started</li>
          <li>Components</li>
          <li>Guides</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize navigation">
        <div />
      </ResizableHandle>
      <ResizablePanel minSize={30}>
        <h3>Getting Started</h3>
        <span data-slot="hint">Install the packages</span>
      </ResizablePanel>
    </Resizable>
  )
}

export { Example }
