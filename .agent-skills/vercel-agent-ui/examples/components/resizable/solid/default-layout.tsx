import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable"

function Example() {
  return (
    <Resizable defaultLayout={[25, 35, 40]}>
      <ResizablePanel minSize={15}>
        <h3>Mail</h3>
        <ul>
          <li>Inbox</li>
          <li>Drafts</li>
          <li>Sent</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize folders" />
      <ResizablePanel minSize={15}>
        <h3>Inbox</h3>
        <ul>
          <li>Hollis Grant</li>
          <li>Inès Moreau</li>
          <li>Kofi Mensah</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize inbox" />
      <ResizablePanel minSize={15}>
        <h3>Quarterly report</h3>
        <span data-slot="hint">From Hollis Grant</span>
      </ResizablePanel>
    </Resizable>
  )
}

export { Example }
