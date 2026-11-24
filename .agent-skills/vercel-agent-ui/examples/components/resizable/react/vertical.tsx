"use client"

import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/react/resizable"

function Example() {
  return (
    <Resizable orientation="vertical">
      <ResizablePanel defaultSize={45} minSize={25}>
        <h3>Inbox</h3>
        <span data-slot="hint">3 unread messages</span>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize inbox" />
      <ResizablePanel defaultSize={55} minSize={25}>
        <h3>Quarterly report</h3>
        <span data-slot="hint">From Hollis Grant</span>
      </ResizablePanel>
    </Resizable>
  )
}

export { Example }
