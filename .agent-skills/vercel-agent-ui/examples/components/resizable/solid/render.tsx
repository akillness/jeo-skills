import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable"

function Example() {
  return (
    <Resizable>
      <ResizablePanel defaultSize={35} minSize={20} collapsible>
        {(state) => (
          <>
            <h3>Files</h3>
            <span data-slot="hint">
              {state.collapsed ? "Collapsed" : `${Math.round(state.size)}%`}
            </span>
          </>
        )}
      </ResizablePanel>
      <ResizableHandle
        aria-label="Resize files"
        render={(props) => <div {...props} />}
      />
      <ResizablePanel minSize={30}>
        {(state) => (
          <>
            <h3>Editor</h3>
            <span data-slot="hint">{`${Math.round(state.size)}%`}</span>
          </>
        )}
      </ResizablePanel>
    </Resizable>
  )
}

export { Example }
