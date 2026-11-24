import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable"

function Example() {
  return (
    <Resizable autoSaveId="docs-persistence">
      <ResizablePanel id="docs-sidebar" defaultSize={30} minSize={20}>
        <h3>Outline</h3>
        <ul>
          <li>Introduction</li>
          <li>Installation</li>
          <li>Usage</li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize outline">
        <div />
      </ResizableHandle>
      <ResizablePanel id="docs-content" minSize={30}>
        <h3>Introduction</h3>
        <span data-slot="hint">Last edited by Wren Takahashi</span>
      </ResizablePanel>
    </Resizable>
  )
}

export { Example }
